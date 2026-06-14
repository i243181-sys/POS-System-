using System.IO;
using Microsoft.Data.Sqlite;
using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.UnitOfWork;

namespace SecureStore.POS.Application.Services;

public class BackupService : IBackupService
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;
    private readonly string _dbPath;
    private readonly string _backupFolder;

    public BackupService(IUnitOfWork uow, IAuditService audit,
        Microsoft.Extensions.Configuration.IConfiguration config)
    {
        _uow = uow;
        _audit = audit;
        _backupFolder = Path.GetFullPath(config["AppSettings:BackupFolderPath"] ?? "Backups");
        _dbPath = ResolveSqlitePath(config["ConnectionStrings:Sqlite"] ?? "Data Source=Data/securestore-pos.db");
        Directory.CreateDirectory(_backupFolder);
    }

    public async Task<(bool success, string message, string? backupPath)> CreateBackupAsync(
        int userId, bool isAutomatic = false)
    {
        try
        {
            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
            var fileName = $"SecureStorePOS_Backup_{timestamp}.db";
            var destPath = Path.Combine(_backupFolder, fileName);

            if (!File.Exists(_dbPath))
                return (false, "Database file not found.", null);

            var tempPath = destPath + ".tmp";
            File.Copy(_dbPath, tempPath, overwrite: false);
            VerifySqliteFile(tempPath);
            File.Move(tempPath, destPath);
            var fileInfo = new FileInfo(destPath);

            var log = new BackupLog
            {
                BackupPath = destPath,
                FileSizeBytes = fileInfo.Length,
                BackupDate = DateTime.UtcNow,
                CreatedByUserID = userId > 0 ? userId : null,
                Status = "Success",
                IsAutomatic = isAutomatic
            };
            await _uow.BackupLogs.AddAsync(log);
            await _uow.SaveChangesAsync();

            await _audit.LogAsync("BACKUP_CREATED", "BackupLog", log.BackupID.ToString(),
                $"Backup created: {fileName} ({fileInfo.Length / 1024} KB). Automatic: {isAutomatic}",
                userId > 0 ? userId : null);

            return (true, $"Backup created: {destPath}", destPath);
        }
        catch (Exception ex)
        {
            AppLogger.LogError(ex, "BackupService.CreateBackupAsync");
            var errorLog = new BackupLog
            {
                BackupPath = "N/A",
                FileSizeBytes = 0,
                BackupDate = DateTime.UtcNow,
                CreatedByUserID = userId > 0 ? userId : null,
                Status = "Failed",
                ErrorMessage = ex.Message,
                IsAutomatic = isAutomatic
            };
            await _uow.BackupLogs.AddAsync(errorLog);
            await _uow.SaveChangesAsync();
            return (false, $"Backup failed: {ex.Message}", null);
        }
    }

    public async Task<(bool success, string message)> RestoreBackupAsync(
        string backupFilePath, int userId)
    {
        try
        {
            if (!File.Exists(backupFilePath))
                return (false, "Backup file not found.");
            VerifySqliteFile(backupFilePath);

            // Create a safety backup before restoring
            var safetyTimestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
            var safetyPath = Path.Combine(_backupFolder, $"PreRestore_Safety_{safetyTimestamp}.db");
            if (File.Exists(_dbPath))
            {
                File.Copy(_dbPath, safetyPath, overwrite: true);
                VerifySqliteFile(safetyPath);
            }

            var pendingRestorePath = _dbPath + ".restore.pending";
            var tempRestorePath = pendingRestorePath + ".tmp";
            File.Copy(backupFilePath, tempRestorePath, overwrite: true);
            VerifySqliteFile(tempRestorePath);
            File.Move(tempRestorePath, pendingRestorePath, overwrite: true);

            await _audit.LogAsync("BACKUP_RESTORED", "Database", null,
                $"Database restore staged from: {backupFilePath}. Safety backup: {safetyPath}", userId);

            return (true, "Database restore staged successfully. Close the app, replace the live database with the .restore.pending file, then restart.");
        }
        catch (Exception ex)
        {
            AppLogger.LogError(ex, "BackupService.RestoreBackupAsync");
            return (false, $"Restore failed: {ex.Message}");
        }
    }

    public async Task<IEnumerable<BackupLog>> GetBackupHistoryAsync() =>
        (await _uow.BackupLogs.GetAllAsync())
            .OrderByDescending(b => b.BackupDate)
            .ToList();

    private static string ResolveSqlitePath(string connectionString)
    {
        var builder = new SqliteConnectionStringBuilder(connectionString);
        return Path.GetFullPath(Path.IsPathRooted(builder.DataSource)
            ? builder.DataSource
            : Path.Combine(AppContext.BaseDirectory, builder.DataSource));
    }

    private static void VerifySqliteFile(string filePath)
    {
        var fileInfo = new FileInfo(filePath);
        if (!fileInfo.Exists || fileInfo.Length == 0)
            throw new InvalidOperationException("SQLite backup file is empty or missing.");

        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = filePath,
            Mode = SqliteOpenMode.ReadOnly
        };
        using var connection = new SqliteConnection(builder.ConnectionString);
        connection.Open();

        using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA integrity_check;";
            var result = Convert.ToString(command.ExecuteScalar());
            if (!string.Equals(result, "ok", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("SQLite integrity check failed.");
        }

        using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA foreign_key_check;";
            using var reader = command.ExecuteReader();
            if (reader.Read())
                throw new InvalidOperationException("SQLite foreign key check failed.");
        }
    }
}

public class SettingsService : ISettingsService
{
    private readonly IUnitOfWork _uow;

    public SettingsService(IUnitOfWork uow) => _uow = uow;

    public async Task<string?> GetSettingAsync(string key)
    {
        var s = await _uow.Settings.FirstOrDefaultAsync(x => x.SettingKey == key);
        return s?.SettingValue;
    }

    public async Task SetSettingAsync(string key, string value)
    {
        var s = await _uow.Settings.FirstOrDefaultAsync(x => x.SettingKey == key);
        if (s is null)
        {
            await _uow.Settings.AddAsync(new Setting
            {
                SettingKey = key,
                SettingValue = value,
                UpdatedAt = DateTime.UtcNow
            });
        }
        else
        {
            s.SettingValue = value;
            s.UpdatedAt = DateTime.UtcNow;
            _uow.Settings.Update(s);
        }
        await _uow.SaveChangesAsync();
    }

    public async Task<Dictionary<string, string>> GetAllSettingsAsync()
    {
        var settings = await _uow.Settings.GetAllAsync();
        return settings.ToDictionary(s => s.SettingKey, s => s.SettingValue);
    }
}
