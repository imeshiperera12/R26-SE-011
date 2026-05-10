const CryptoJS = require('crypto-js');

const generateProvenanceHash = (standardizedJson) => {
    // 1. Sort the array alphabetically by candidateId.
    // This guarantees the JSON string is identical regardless of Excel row order.
    const deterministicData = [...standardizedJson].sort((a, b) => 
        a.candidateId.localeCompare(b.candidateId)
    );

    // 2. Stringify ONLY the sorted academic data
    const dataString = JSON.stringify(deterministicData);
    
    // 3. Generate the SHA-256 hash from the pure data string
    const hash = CryptoJS.SHA256(dataString).toString(CryptoJS.enc.Hex);
    
    // 4. Assemble the final sealed record
    // Notice how the timestamp and filename (if we had it) are OUTSIDE the hash payload
    const sealedRecord = {
        provenanceHash: hash,
        extractedAt: new Date().toISOString(), // Metadata added after hashing
        recordCount: deterministicData.length,
        data: deterministicData
    };

    return sealedRecord;
};

module.exports = { generateProvenanceHash };