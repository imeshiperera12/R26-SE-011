// middleware/src/boe-direct-handoff.js
const axios = require('axios');

async function pushToBOEDirect(uploadReceipt, extractedData) {
    // 🌐 Gets base URL from .env (or localhost) and appends the direct update route
    const baseUrl = process.env.COMPONENT_2_BASE_URL || process.env.COMPONENT_2_URL || 'http://localhost:5001';
    const COMPONENT_2_DIRECT_ENDPOINT = `${baseUrl.replace(/\/$/, '')}/api/boe/direct-update`;

    const payload = {
        metadata: {
            provenanceHash: uploadReceipt.provenanceHash,
            moduleCode: uploadReceipt.moduleCode,
            uploaderName: uploadReceipt.uploader,
            timestamp: new Date().toISOString(),
            source: "COMPONENT_3_SPECIAL_CONCERN",
            isRecorrection: true
        },
        records: extractedData.map(item => {
            const rawMarks = item.gradingData["Marks"] || 
                             item.gradingData["New Marks"] || 
                             item.gradingData["Override Marks"] || 
                             item.gradingData["Final Marks"] || 
                             item.gradingData["Total Score"] || 0;

            const rawGrade = item.gradingData["Final Grade"] || 
                             item.gradingData["Appealed Grade"] || 
                             item.gradingData["Override Grade"] || 
                             item.gradingData["Grade"] || 
                             item.gradingData["Overall Grade"] || "Pass";

            return {
                candidateId: item.candidateId,
                gradingData: {
                    ...item.gradingData,
                    "Marks": rawMarks,
                    "Final Grade": rawGrade
                }
            };
        })
    };

    try {
        console.log(`\n⚡ Special Concern: Initiating Direct Handoff to Component 2 for ${uploadReceipt.moduleCode}...`);
        console.log(`   ➔ Payload sample:`, JSON.stringify(payload.records[0] || {}, null, 2));

        const response = await axios.post(COMPONENT_2_DIRECT_ENDPOINT, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 8000 
        });

        console.log('✅ Handoff Successful: Component 2 acknowledged direct update.');
        return { 
            success: true, 
            status: 'bypassed_boe',
            message: 'Successfully bypassed BOE review and routed to Component 2 Live DB.' 
        };

    } catch (error) {
        console.error('❌ Component 2 Direct Handoff Failed:', error.response?.data || error.message);
        
        return { 
            success: false, 
            status: 'queued_bypass',
            message: 'Component 2 unreachable. Special Concern secured in local ledger and queued.' 
        };
    }
}

module.exports = { pushToBOEDirect };