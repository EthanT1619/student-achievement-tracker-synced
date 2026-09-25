/**
 * localStorage read/write with parse recovery, quota handling, and corrupt backups.
 */
(function (SAT) {
  SAT.STORAGE_CORRUPT_PREFIX = 'studentAchievementTracker_corruptBackup_';
  SAT.MAX_CORRUPT_BACKUPS = 5;

  SAT.StorageErrorCodes = {
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    SECURITY_ERROR: 'SECURITY_ERROR',
    WRITE_FAILED: 'WRITE_FAILED',
    PARSE_ERROR: 'PARSE_ERROR',
    RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
    READ_FAILED: 'READ_FAILED',
  };

  SAT.STORAGE_RECOVERY_MESSAGE =
    '저장된 데이터의 형식이 손상되어 정상적으로 불러오지 못했습니다.\n' +
    '손상된 원본은 복구용 백업으로 보존되었습니다.\n' +
    '기존 저장소를 초기화하거나 JSON 백업을 복원하기 전까지\n' +
    '새 데이터를 저장하지 않는 것을 권장합니다.';

  SAT.STORAGE_RECOVERY_START_FRESH_MESSAGE =
    '현재 손상된 저장 데이터를 초기화하고 빈 데이터로 시작합니다.\n' +
    '복구용 원본은 별도 백업에 남아 있습니다. 계속하시겠습니까?';

  SAT.classifyStorageError = function classifyStorageError(err) {
    const name = err?.name || '';
    const message = String(err?.message || err || '');
    const lower = message.toLowerCase();

    if (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      lower.includes('quota') ||
      lower.includes('exceeded')
    ) {
      return {
        code: SAT.StorageErrorCodes.QUOTA_EXCEEDED,
        message:
          '브라우저 저장 공간이 부족해 데이터를 저장하지 못했습니다.\n' +
          '먼저 JSON 백업을 다운로드한 뒤 오래된 시험이나 결과를 정리해주세요.',
      };
    }

    if (
      name === 'SecurityError' ||
      lower.includes('security') ||
      lower.includes('denied') ||
      lower.includes('not allowed')
    ) {
      return {
        code: SAT.StorageErrorCodes.SECURITY_ERROR,
        message:
          '브라우저가 로컬 데이터 저장을 허용하지 않아 저장하지 못했습니다.\n' +
          '시크릿 모드 또는 브라우저 저장소 설정을 확인해주세요.',
      };
    }

    return {
      code: SAT.StorageErrorCodes.WRITE_FAILED,
      message: '데이터 저장 중 오류가 발생했습니다. JSON 백업을 먼저 보관해주세요.',
    };
  };

  SAT.estimateStorageBytes = function estimateStorageBytes(data) {
    try {
      if (typeof data === 'string') return new TextEncoder().encode(data).length;
      return new TextEncoder().encode(JSON.stringify(data)).length;
    } catch {
      return String(data ?? '').length * 2;
    }
  };

  function listKeysWithPrefix(storage, prefix) {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    return keys.sort();
  }

  SAT.createLocalStorageAdapter = function createLocalStorageAdapter(storage = localStorage) {
    function getItem(key) {
      try {
        return { ok: true, value: storage.getItem(key) };
      } catch (err) {
        const classified = SAT.classifyStorageError(err);
        return { ok: false, code: SAT.StorageErrorCodes.READ_FAILED, message: classified.message, error: err };
      }
    }

    function setItem(key, value) {
      try {
        storage.setItem(key, value);
        return { ok: true };
      } catch (err) {
        const classified = SAT.classifyStorageError(err);
        return { ok: false, code: classified.code, message: classified.message, error: err };
      }
    }

    function removeItem(key) {
      try {
        storage.removeItem(key);
        return { ok: true };
      } catch (err) {
        const classified = SAT.classifyStorageError(err);
        return { ok: false, code: classified.code, message: classified.message, error: err };
      }
    }

    function readJson(key) {
      const got = getItem(key);
      if (!got.ok) return got;
      if (got.value == null) return { ok: true, value: null };
      try {
        return { ok: true, value: JSON.parse(got.value) };
      } catch (err) {
        return {
          ok: false,
          code: SAT.StorageErrorCodes.PARSE_ERROR,
          raw: got.value,
          message: SAT.STORAGE_RECOVERY_MESSAGE,
          error: err,
        };
      }
    }

    function writeJson(key, data) {
      let serialized;
      try {
        serialized = JSON.stringify(data);
      } catch (err) {
        return {
          ok: false,
          code: SAT.StorageErrorCodes.WRITE_FAILED,
          message: '데이터 저장 중 오류가 발생했습니다. JSON 백업을 먼저 보관해주세요.',
          error: err,
        };
      }
      const wrote = setItem(key, serialized);
      if (!wrote.ok) return wrote;
      return { ok: true, bytes: SAT.estimateStorageBytes(serialized) };
    }

    function pruneCorruptBackups(maxBackups = SAT.MAX_CORRUPT_BACKUPS) {
      const keys = listKeysWithPrefix(storage, SAT.STORAGE_CORRUPT_PREFIX);
      const excess = keys.length - maxBackups;
      if (excess <= 0) return { ok: true, removed: [] };
      const removed = [];
      for (let i = 0; i < excess; i += 1) {
        const key = keys[i];
        const result = removeItem(key);
        if (result.ok) removed.push(key);
      }
      return { ok: true, removed };
    }

    function preserveCorruptBackup(mainKey, raw) {
      const timestamp = Date.now();
      const suffix = Math.random().toString(36).slice(2, 8);
      const backupKey = `${SAT.STORAGE_CORRUPT_PREFIX}${timestamp}_${suffix}`;
      const saved = setItem(backupKey, raw);
      if (!saved.ok) {
        return { ok: false, backupKey: null, ...saved };
      }
      pruneCorruptBackups();
      return { ok: true, backupKey, mainKey, savedAt: new Date(timestamp).toISOString() };
    }

    function listCorruptBackupKeys() {
      return listKeysWithPrefix(storage, SAT.STORAGE_CORRUPT_PREFIX);
    }

    function getCorruptBackupRaw(backupKey) {
      const got = getItem(backupKey);
      if (!got.ok) return got;
      return { ok: true, raw: got.value };
    }

    return {
      storage,
      getItem,
      setItem,
      removeItem,
      readJson,
      writeJson,
      preserveCorruptBackup,
      pruneCorruptBackups,
      listCorruptBackupKeys,
      getCorruptBackupRaw,
    };
  };
})(window.SAT = window.SAT || {});
