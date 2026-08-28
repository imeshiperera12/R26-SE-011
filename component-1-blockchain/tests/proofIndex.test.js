"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const ResultProofIndex = require("../models/ResultProofIndex");
const proofController = require("../controllers/proofController");

function responseRecorder() {
    return {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
}

test("proof index schema preserves versioned roots with a unique key", () => {
    assert.ok(ResultProofIndex.schema.path("version"));
    const historicalIndex = ResultProofIndex.schema.indexes().find(([fields]) =>
        fields.candidateId === 1 &&
        fields.moduleCode === 1 &&
        fields.version === 1 &&
        fields.merkleRoot === 1
    );
    assert.ok(historicalIndex);
    assert.equal(historicalIndex[1].unique, true);
});

test("record lookup applies an exact requested version", async (t) => {
    const originalFindOne = ResultProofIndex.findOne;
    let receivedQuery;

    ResultProofIndex.findOne = (query) => {
        receivedQuery = query;
        return {
            sort() {
                return this;
            },
            async lean() {
                return {
                    candidateId: "IT22061348",
                    moduleCode: "CS3013",
                    version: 1,
                    merkleRoot: "0xabc",
                    ipfsCID: "QmHistorical",
                    anchoredAt: new Date("2026-01-01T00:00:00.000Z")
                };
            }
        };
    };
    t.after(() => {
        ResultProofIndex.findOne = originalFindOne;
    });

    const res = responseRecorder();
    await proofController.getRecordProofContext({
        params: { candidateId: "IT22061348", moduleCode: "CS3013" },
        query: { version: "1" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(receivedQuery, {
        candidateId: "IT22061348",
        moduleCode: "CS3013",
        version: 1
    });
    assert.equal(res.payload.record.version, 1);
});

test("record lookup rejects an invalid version", async () => {
    const res = responseRecorder();
    await proofController.getRecordProofContext({
        params: { candidateId: "IT22061348", moduleCode: "CS3013" },
        query: { version: "not-a-version" }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.success, false);
});

test("candidate history returns all indexed proof contexts", async (t) => {
    const originalFind = ResultProofIndex.find;
    const entries = [
        {
            candidateId: "IT22061348",
            moduleCode: "CS3013",
            version: 1,
            merkleRoot: "0xold",
            ipfsCID: "QmOld",
            anchoredAt: new Date("2026-01-01T00:00:00.000Z")
        },
        {
            candidateId: "IT22061348",
            moduleCode: "CS3013",
            version: 2,
            merkleRoot: "0xnew",
            ipfsCID: "QmNew",
            anchoredAt: new Date("2026-02-01T00:00:00.000Z")
        }
    ];

    ResultProofIndex.find = (query) => {
        assert.deepEqual(query, { candidateId: "IT22061348" });
        return {
            sort() {
                return this;
            },
            async lean() {
                return entries;
            }
        };
    };
    t.after(() => {
        ResultProofIndex.find = originalFind;
    });

    const res = responseRecorder();
    await proofController.getCandidateProofContexts({
        params: { candidateId: "IT22061348" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.records.length, 2);
    assert.deepEqual(res.payload.records.map((item) => item.version), [1, 2]);
});
