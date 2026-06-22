const DB_NAME = 'NexusReaderDB';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // We index by timestamp to get recent documents easily
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

window.NexusStorage = {
    async saveDocument(file) {
        const db = await initDB();
        return new Promise(async (resolve, reject) => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const docId = 'doc_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                
                // Determine icon based on file type
                let iconClass = "fa-regular fa-file-lines";
                let iconBg = "rgba(59, 130, 246, 0.1)";
                let iconColor = "#3b82f6";
                
                if (file.type === 'application/pdf') {
                    iconClass = "fa-solid fa-file-pdf";
                    iconBg = "rgba(239, 68, 68, 0.1)";
                    iconColor = "#ef4444";
                } else if (file.name.endsWith('.docx')) {
                    iconClass = "fa-solid fa-file-word";
                    iconBg = "rgba(59, 130, 246, 0.1)";
                    iconColor = "#3b82f6";
                } else if (file.type.startsWith('image/')) {
                    iconClass = "fa-regular fa-image";
                    iconBg = "rgba(16, 185, 129, 0.1)";
                    iconColor = "#10b981";
                }

                const docRecord = {
                    id: docId,
                    name: file.name,
                    type: file.type,
                    data: arrayBuffer,
                    timestamp: Date.now(),
                    iconClass,
                    iconBg,
                    iconColor
                };

                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(docRecord);

                request.onsuccess = () => resolve(docId);
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    },

    async getRecentDocuments() {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('timestamp');
            
            // Open cursor in descending order to get newest first
            const request = index.openCursor(null, 'prev');
            const results = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    // We only want metadata, not the huge data arraybuffer to save memory
                    const { id, name, type, timestamp, iconClass, iconBg, iconColor } = cursor.value;
                    results.push({ id, name, type, timestamp, iconClass, iconBg, iconColor });
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getDocument(id) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                if (request.result) {
                    // Reconstruct a File object
                    const file = new File([request.result.data], request.result.name, { type: request.result.type });
                    resolve(file);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
};
