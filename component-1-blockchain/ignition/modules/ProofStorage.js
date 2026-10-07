const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const ProofStorageModule = buildModule(
    "ProofStorageModule",
    (m) => {

        const proofStorage =
            m.contract("ProofStorage");

        return {
            proofStorage
        };
    }
);

module.exports = ProofStorageModule;
