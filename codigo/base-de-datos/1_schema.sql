/* Sistema de Gestión de Cubículos · Infoteca Campus Arteaga · SQL Server */
IF DB_ID('InfotecaCubiculos') IS NULL CREATE DATABASE InfotecaCubiculos;
GO
USE InfotecaCubiculos;
GO
CREATE TABLE Usuarios(
  IdUsuario INT IDENTITY(1,1) PRIMARY KEY,
  Nombre    NVARCHAR(120) NOT NULL,
  Correo    NVARCHAR(150) NOT NULL UNIQUE,
  Rol       NVARCHAR(20)  NOT NULL DEFAULT 'alumno' CHECK (Rol IN ('alumno','personal'))
);
CREATE TABLE Cubiculos(
  IdCubiculo INT IDENTITY(1,1) PRIMARY KEY,
  Codigo     NVARCHAR(5)  NOT NULL UNIQUE,          -- A-01 ... B-05
  Zona       CHAR(1)      NOT NULL CHECK (Zona IN ('A','B')),
  Ubicacion  NVARCHAR(60) NOT NULL DEFAULT 'Planta baja',
  Estado     NVARCHAR(20) NOT NULL DEFAULT 'disponible'
);
CREATE TABLE Reservaciones(
  IdReservacion INT IDENTITY(1,1) PRIMARY KEY,
  Codigo        NVARCHAR(9) NOT NULL UNIQUE,        -- el que lleva el QR
  IdCubiculo    INT NOT NULL REFERENCES Cubiculos(IdCubiculo),
  IdUsuario     INT NOT NULL REFERENCES Usuarios(IdUsuario),
  Fecha         DATE    NOT NULL,
  HoraInicio    TINYINT NOT NULL,
  HoraFin       TINYINT NOT NULL,
  Estado        NVARCHAR(12) NOT NULL DEFAULT 'activa' CHECK (Estado IN ('activa','cancelada')),
  CreadaEn      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ConfirmadaEn  DATETIME2 NULL,
  EntradaEn     DATETIME2 NULL,
  SalidaEn      DATETIME2 NULL,
  CanceladaEn   DATETIME2 NULL,
  CONSTRAINT CK_Horario CHECK (HoraInicio >= 9 AND HoraFin <= 20 AND HoraFin > HoraInicio AND HoraFin - HoraInicio <= 2)
);
CREATE INDEX IX_Reservaciones_Busqueda ON Reservaciones(IdCubiculo, Fecha, Estado);
GO
INSERT INTO Cubiculos(Codigo,Zona) VALUES
('A-01','A'),('A-02','A'),('A-03','A'),('A-04','A'),('A-05','A'),
('B-01','B'),('B-02','B'),('B-03','B'),('B-04','B'),('B-05','B');
GO
