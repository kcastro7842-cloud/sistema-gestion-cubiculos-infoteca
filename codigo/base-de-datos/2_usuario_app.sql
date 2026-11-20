/* Ejecutar en SSMS DESPUÉS de 1_schema.sql. Cambia TuClave123 (y el mismo valor en el archivo .env). */
EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'LoginMode', REG_DWORD, 2;
CREATE LOGIN infoteca_app WITH PASSWORD = 'TuClave123', CHECK_POLICY = OFF;
GO
USE InfotecaCubiculos;
CREATE USER infoteca_app FOR LOGIN infoteca_app;
ALTER ROLE db_datareader ADD MEMBER infoteca_app;
ALTER ROLE db_datawriter ADD MEMBER infoteca_app;
GO
