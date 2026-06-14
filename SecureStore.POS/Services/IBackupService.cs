using SecureStore.POS.Domain.Entities;

namespace SecureStore.POS.Services;

public interface IBackupService
{
    Task<BackupLog> CreateBackupAsync(int? userId = null, bool isAutomatic = false);
    Task<BackupLog> RestoreBackupAsync(string backupFilePath, int? userId = null);
    Task<IEnumerable<BackupLog>> GetBackupHistoryAsync();
}
