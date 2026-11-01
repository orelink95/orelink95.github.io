/* =====================================================================
   SEAL  —  password-protected text (hero secrets)
   ---------------------------------------------------------------------
   Athenaeum.seal(text, password)   -> Promise<{v, salt, iv, data}>
   Athenaeum.unseal(sealed, password) -> Promise<text | null>  (null = wrong password)

   AES-GCM 256 with a key derived from the password (PBKDF2-SHA256,
   200 000 rounds, random salt). The password is trimmed and lower-cased
   first, so players don't trip over capitals. Without the password the
   published data reveals nothing; a short password can still be guessed
   by someone patient, so pick a word they would not try first.
   Works in the browser (https, localhost or file://) and in Node 18+.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const subtle = () => (root.crypto && root.crypto.subtle) || null;
    const ROUNDS = 200000;

    const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const norm = p => String(p || '').trim().toLowerCase();

    async function keyFor(password, salt) {
        const base = await subtle().importKey('raw', new TextEncoder().encode(norm(password)), 'PBKDF2', false, ['deriveKey']);
        return subtle().deriveKey(
            { name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    ATH.seal = async function (text, password) {
        if (!subtle()) throw new Error('Encryption needs a secure page (https, localhost or a file)');
        const salt = root.crypto.getRandomValues(new Uint8Array(16));
        const iv = root.crypto.getRandomValues(new Uint8Array(12));
        const key = await keyFor(password, salt);
        const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(text)));
        return { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
    };

    ATH.unseal = async function (sealed, password) {
        if (!sealed || !subtle()) return null;
        try {
            const key = await keyFor(password, fromB64(sealed.salt));
            const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.data));
            return new TextDecoder().decode(plain);
        } catch (e) {
            return null;   // wrong password (or damaged data)
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
