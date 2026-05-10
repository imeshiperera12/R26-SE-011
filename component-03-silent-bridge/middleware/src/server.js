const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Import our custom middleware engines
const { parseExcelToJson } = require('./extraction/parser');
const { generateProvenanceHash } = require('./hashing/hasher');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Path to our simulated Private Ledger
const ledgerPath = path.join(__dirname, '../../private_ledger/database.json');

app.post('/api/ingest', upload.single('gradingSheet'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        console.log(`\n📥 1. Received file: ${req.file.originalname}`);

        // --- STAGE 1: EXTRACTION ---
        console.log(`⚙️  2. Extracting and standardizing schema...`);
        const standardizedJson = parseExcelToJson(req.file.buffer);

        // Grab the module code sent from the React frontend
        const moduleCode = req.body.moduleCode || "UNKNOWN_MODULE";
        const uploaderName = req.body.uploader || "UNKNOWN_UPLOADER";

        // --- STAGE 2: HASHING ---
        console.log(`🔒 3. Generating SHA-256 Provenance Hash...`);
        const sealedRecord = generateProvenanceHash(standardizedJson);

        // Attach the module code to the payload BEFORE saving it to the ledger
        sealedRecord.moduleCode = moduleCode.toUpperCase();
        sealedRecord.uploader = uploaderName;

        // --- STAGE 3: STORAGE & DUPLICATE PREVENTION ---
        console.log(`💾 4. Verifying Ledger Integrity...`);
        
        // Read the existing ledger
        const rawLedger = fs.readFileSync(ledgerPath);
        const ledger = JSON.parse(rawLedger);
        
        // Check if this EXACT cryptographic hash already exists in the ledger
        const isDuplicate = ledger.some(block => block.provenanceHash === sealedRecord.provenanceHash);

        if (isDuplicate) {
            console.log(`⚠️ Duplicate Payload Detected. Hash already exists in ledger. Skipped saving.`);
            
            // Return a 200 OK, but let the frontend know it was already in the system
            return res.status(200).json({ 
                message: 'Data already securely anchored in the Private Ledger.',
                fileName: req.file.originalname,
                moduleCode: sealedRecord.moduleCode,
                uploader: sealedRecord.uploader,
                recordCount: sealedRecord.recordCount,
                provenanceHash: sealedRecord.provenanceHash,
                status: 'duplicate'
            });
        }

        // If it is NOT a duplicate, push it to the ledger and save
        ledger.push(sealedRecord);
        fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

        console.log(`✅ Success! Provenance Hash: ${sealedRecord.provenanceHash}\n`);

        res.status(200).json({ 
            message: 'Extraction and Hashing successful!',
            fileName: req.file.originalname,
            moduleCode: sealedRecord.moduleCode,
            uploader: sealedRecord.uploader,
            recordCount: sealedRecord.recordCount,
            provenanceHash: sealedRecord.provenanceHash,
            status: 'new'
        });

    } catch (error) {
        console.error('❌ Ingestion Error:', error);
        res.status(500).json({ error: 'Internal Server Error during ingestion' });
    }
});

// API route for the employer Verification Portal 
app.get('/api/verify/:studentId', (req, res) => {
    try {
        const studentId = req.params.studentId.toUpperCase();
        console.log(`\n🔍 Verification Query received for Candidate: ${studentId}`);

        // 1. Open the Private Ledger
        const rawLedger = fs.readFileSync(ledgerPath);
        const ledger = JSON.parse(rawLedger);

        let foundRecords = [];

        // 2. Search through all sealed ledger blocks
        ledger.forEach(block => {
            const studentRecord = block.data.find(row => row.candidateId.toUpperCase() === studentId);
            if (studentRecord) {
                foundRecords.push({
                    moduleCode: block.moduleCode || "UNKNOWN_MODULE", 
                    uploader: block.uploader || "System",
                    gradingData: studentRecord.gradingData,
                    provenanceHash: block.provenanceHash,
                    sealedAt: block.extractedAt
                });
            }
        });

        // 3. Return the verified results
        if (foundRecords.length > 0) {
            console.log(`✅ Found ${foundRecords.length} verified records for ${studentId}`);
            res.status(200).json({ success: true, records: foundRecords });
        } else {
            console.log(`❌ No records found for ${studentId}`);
            res.status(404).json({ success: false, message: "No cryptographic records found." });
        }

    } catch (error) {
        console.error('Search Error:', error);
        res.status(500).json({ error: 'Internal Server Error during verification' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Silent Bridge Middleware running on http://localhost:${port}`);
});