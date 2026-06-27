import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const getEncryptionKey = () => {
  const hexKey = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // fallback for development
  if (hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(hexKey, 'hex');
};

export const decrypt = (encryptedData) => {
  try {
    if (!encryptedData || !encryptedData.includes(':')) {
      return '';
    }
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
    
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Invalid encrypted data format.');
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    throw error;
  }
};
