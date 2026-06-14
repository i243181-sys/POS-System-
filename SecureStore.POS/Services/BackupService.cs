using System.Data;
using System.IO;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.Data;
using SecureStore.POS.Infrastructure.UnitOfWork;

namespace SecureStore.POS.Services;

public class BackupService : IBackupService
{
    private readonly IConfiguration _configuration;
    private readonly IUnitOfWork _unitOfWork;
    private readonly AppDbContext _context;

    public BackupService(IConfiguration configuration, IUnitOfWork unitOfWork, AppDbContext context)
    {
        _configuration = configuration;
        _unitOfWork = unitOfWork;
        _context = context;
    }

    public async Task<BackupLog> CreateBackupAsync(int? userId = null, bool isAutomatic = false)
    {
        var backupFolder = ResolveBackupFolder();
        Directory.CreateDirectory(backupFolder);

        var backupFileName = $"SecureStorePOS_{DateTime.UtcNow:yyyyMMdd_HHmmss}.{(_context.Database.IsSqlite() ? "db" : "bak")}";
        var backupPath = Path.Combine(backupFolder, backupFileName);
        var log = new BackupLog { BackupPath = backupPath, BackupDate = DateTime.UtcNow, CreatedByUserID = userId, IsAutomatic = isAutomatic };

        try
        {
            if (_context.Database.IsSqlite())
            {
                await CreateSqliteBackupAsync(backupPath);
                log.Status = "Success";
                log.ErrorMessage = null;
                log.FileSizeBytes = new FileInfo(backupPath).Length;
                await _unitOfWork.BackupLogs.AddAsync(log);
                await _unitOfWork.SaveChangesAsync();
                return log;
            }

            var sqlConnection = _configuration.GetConnectionString("SqlServer")
                ?? _configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("SQL Server connection string is missing.");
            await using var connection = new SqlConnection(sqlConnection);
            await connection.OpenAsync();
            var databaseName = connection.Database;
            var commandText = $"BACKUP DATABASE [{databaseName}] TO DISK = @backupPath WITH INIT, NAME = @backupName";

            await using var backupCommand = new SqlCommand(commandText, connection);
            backupCommand.Parameters.AddWithValue("@backupPath", backupPath);
            backupCommand.Parameters.AddWithValue("@backupName", databaseName);
            await backupCommand.ExecuteNonQueryAsync();

            log.Status = "Success";
            log.ErrorMessage = null;
            log.FileSizeBytes = new FileInfo(backupPath).Length;
        }
        catch (Exception ex)
        {
            log.Status = "Failed";
            log.ErrorMessage = ex.Message;
        }

        await _unitOfWork.BackupLogs.AddAsync(log);
        await _unitOfWork.SaveChangesAsync();
        return log;
    }

    public async Task<BackupLog> RestoreBackupAsync(string backupFilePath, int? userId = null)
    {
        var log = new BackupLog { BackupPath = backupFilePath, BackupDate = DateTime.UtcNow, CreatedByUserID = userId, IsAutomatic = false };
        try
        {
            if (_context.Database.IsSqlite())
            {
                await RestoreSqliteBackupAsync(backupFilePath);
                log.Status = "Success";
                log.ErrorMessage = "Restore was staged safely. Close the app and replace the live database with the .restore.pending file.";
                log.FileSizeBytes = new FileInfo(backupFilePath).Length;
                await _unitOfWork.BackupLogs.AddAsync(log);
                await _unitOfWork.SaveChangesAsync();
                return log;
            }

            var sqlConnection = _configuration.GetConnectionString("SqlServer")
                ?? _configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("SQL Server connection string is missing.");
            var builder = new SqlConnectionStringBuilder(sqlConnection);
            var databaseName = builder.InitialCatalog;
            builder.InitialCatalog = "master";
            await using var connection = new SqlConnection(builder.ConnectionString);
            await connection.OpenAsync();

            var setSingleUser = $"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE";
            var restoreCommand = $"RESTORE DATABASE [{databaseName}] FROM DISK = @backupPath WITH REPLACE";
            var setMultiUser = $"ALTER DATABASE [{databaseName}] SET MULTI_USER";

            await using var cmd1 = new SqlCommand(setSingleUser, connection);
            await cmd1.ExecuteNonQueryAsync();
            await using var cmd2 = new SqlCommand(restoreCommand, connection);
            cmd2.Parameters.AddWithValue("@backupPath", backupFilePath);
            await cmd2.ExecuteNonQueryAsync();
            await using var cmd3 = new SqlCommand(setMultiUser, connection);
            await cmd3.ExecuteNonQueryAsync();

            log.Status = "Success";
            log.FileSizeBytes = new FileInfo(backupFilePath).Length;
        }
        catch (Exception ex)
        {
            log.Status = "Failed";
            log.ErrorMessage = ex.Message;
        }

        await _unitOfWork.BackupLogs.AddAsync(log);
        await _unitOfWork.SaveChangesAsync();
        return log;
    }

    public async Task<IEnumerable<BackupLog>> GetBackupHistoryAsync() => await _unitOfWork.BackupLogs.GetAllAsync();

    private async Task CreateSqliteBackupAsync(string backupPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(backupPath)!);
        await _context.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(TRUNCATE);");
        var dbPath = _context.Database.GetDbConnection().DataSource;
        if (string.IsNullOrWhiteSpace(dbPath) || !File.Exists(dbPath))
            throw new FileNotFoundException("SQLite database file was not found.", dbPath);

        if (Path.GetFullPath(dbPath) == Path.GetFullPath(backupPath))
            throw new InvalidOperationException("Backup path cannot be the live database file.");

        var tempPath = backupPath + ".tmp";
        if (File.Exists(tempPath)) File.Delete(tempPath);
        File.Copy(dbPath, tempPath, overwrite: false);
        VerifySqliteFile(tempPath);
        if (File.Exists(backupPath)) File.Delete(backupPath);
        File.Move(tempPath, backupPath);
        VerifySqliteFile(backupPath);
    }

    private async Task RestoreSqliteBackupAsync(string backupFilePath)
    {
        if (!File.Exists(backupFilePath))
            throw new FileNotFoundException("Backup file was not found.", backupFilePath);
        VerifySqliteFile(backupFilePath);

        await _context.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(TRUNCATE);");
        var dbPath = _context.Database.GetDbConnection().DataSource;
        if (string.IsNullOrWhiteSpace(dbPath))
            throw new InvalidOperationException("SQLite database path could not be resolved.");

        var pendingRestorePath = dbPath + ".restore.pending";
        var tempRestorePath = pendingRestorePath + ".tmp";
        if (File.Exists(tempRestorePath)) File.Delete(tempRestorePath);
        File.Copy(backupFilePath, tempRestorePath, overwrite: false);
        VerifySqliteFile(tempRestorePath);
        if (File.Exists(pendingRestorePath)) File.Delete(pendingRestorePath);
        File.Move(tempRestorePath, pendingRestorePath);
        AppLogger.LogWarning(
            $"SQLite restore staged at '{pendingRestorePath}'. Close the POS, replace '{dbPath}', then restart.");
    }

    private string ResolveBackupFolder()
    {
        var configured = _configuration.GetValue<string>("AppSettings:BackupFolderPath") ?? "Backups";
        var folder = Path.IsPathRooted(configured)
            ? configured
            : Path.Combine(AppContext.BaseDirectory, configured);
        return Path.GetFullPath(folder);
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
