const XLSX = require('xlsx');

const parseExcelToJson = (fileBuffer) => {
    try {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);

        const standardizedData = rawJson.map(row => {
            const keys = Object.keys(row);
            
            // 1. Find the primary Identifier column
            const studentIdKey = keys.find(key => key.toLowerCase().includes('id') || key.toLowerCase().includes('student'));
            
            // 2. Define keywords to explicitly strip out (PII and non-grade metadata)
            const excludedKeywords = ['name', 'first', 'last', 'email', 'module', 'semester', 'course', 'year', 'code', 'program', 'degree', 'department', 'faculty', 'intake', 'group'];
            
            // 3. Dynamically harvest ALL remaining columns (Assignments, Labs, Finals)
            const extractedGrades = {};
            keys.forEach(key => {
                if (key !== studentIdKey) {
                    const isExcluded = excludedKeywords.some(keyword => key.toLowerCase().includes(keyword));
                    if (!isExcluded) {
                        extractedGrades[key] = String(row[key]); // Capture the mark
                    }
                }
            });

            // 4. SORT THE COLUMNS ALPHABETICALLY! 
            // This guarantees the hash remains deterministic even if the lecturer rearranges the Excel columns.
            const sortedGrades = {};
            Object.keys(extractedGrades).sort().forEach(sortedKey => {
                sortedGrades[sortedKey] = extractedGrades[sortedKey];
            });

            return {
                candidateId: studentIdKey ? String(row[studentIdKey]) : "UNKNOWN",
                gradingData: sortedGrades
            };
        });

        return standardizedData;
    } catch (error) {
        throw new Error("Failed to parse Excel file: " + error.message);
    }
};

module.exports = { parseExcelToJson };