"use strict";

const crypto = require('node:crypto');

/*
 * Component 4 owns verifier operational data, not academic truth. This store
 * records the evidence and decision emitted by Component 4 after Component 1
 * has resolved and verified the anchored academic record.
 */
let mongoose;
const { prepareMongoConnection } = require('./mongo-connection');

function loadMongoose() {
  if (!mongoose) {
    try {
      // Kept lazy so unit tests that inject a service do not need a database.
      // npm install in backend installs this production dependency.
      mongoose = require('mongoose');
    } catch (error) {
      throw new Error('MongoDB support is not installed. Run `npm install` in backend.');
    }
  }
  return mongoose;
}

let connectionPromise = null;
let VerificationAttempt = null;

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  const db = loadMongoose();
  if (!connectionPromise) {
    connectionPromise = prepareMongoConnection(uri).then((connection) => db.connect(connection.uri, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 30000),
      ...connection.options,
    }));
  }
  await connectionPromise;

  if (!VerificationAttempt) {
    const schema = new db.Schema({
      actor: {
        userId: { type: String, required: true },
        email: { type: String, required: true },
        companyId: { type: String, required: true },
        role: { type: String, required: true },
      },
      // The employer's CV claim is not retained in readable form. This HMAC
      // supports correlation during an audit without disclosing student data.
      requestFingerprint: { type: String, required: true, index: true },
      anchor: {
        merkleRoot: { type: String },
        ipfsCID: { type: String },
      },
      decision: { type: String, enum: ['VALID', 'INVALID', 'ERROR'], required: true },
      checks: { type: db.Schema.Types.Mixed, default: {} },
      errorCode: { type: String, default: null },
    }, { timestamps: true, versionKey: false });
    schema.index({ 'actor.companyId': 1, createdAt: -1 });
    VerificationAttempt = db.models.Component4VerificationAttempt
      || db.model('Component4VerificationAttempt', schema);
  }

  return VerificationAttempt;
}

async function disconnectMongo() {
  if (mongoose) await mongoose.disconnect();
  connectionPromise = null;
}

async function pingMongo() {
  if (!process.env.MONGODB_URI) return false;
  await connectMongo();
  await loadMongoose().connection.db.admin().ping();
  return true;
}

async function recordVerificationAttempt({ session, candidateId, moduleCode, claimedGrade, result }) {
  const Model = await connectMongo();
  if (!Model) return false;

  await Model.create({
    actor: {
      userId: String(session.userId || ''),
      email: String(session.userEmail || ''),
      companyId: String(session.companyId || ''),
      role: String(session.role || ''),
    },
    requestFingerprint: crypto
      .createHmac('sha256', process.env.VERIFICATION_AUDIT_SECRET || process.env.JWT_ACCESS_SECRET || 'component4-development-audit-secret')
      .update(`${candidateId}|${moduleCode}|${claimedGrade}`)
      .digest('hex'),
    anchor: {
      merkleRoot: result?.verificationSource?.blockchain?.merkleRoot || null,
      ipfsCID: result?.verificationSource?.blockchain?.ipfsCID || null,
    },
    decision: result?.valid ? 'VALID' : 'INVALID',
    checks: result?.checks || {},
    errorCode: result?.error || null,
  });
  return true;
}

module.exports = { connectMongo, disconnectMongo, pingMongo, recordVerificationAttempt };
