-- =============================================
-- BARCLICK DATABASE SCHEMA
-- =============================================

-- Habilitar Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- =============================================
-- TABLA: empresas
-- =============================================
CREATE TABLE empresas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    telefono VARCHAR(20),
    whatsapp VARCHAR(20),
    instagram VARCHAR(100),
    facebook VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: usuarios
-- =============================================
CREATE TABLE usuarios (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    rol VARCHAR(20) DEFAULT 'bartender' CHECK (rol IN ('admin', 'bartender')),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: eventos
-- =============================================
CREATE TABLE eventos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME,
    hora_fin TIME,
    ubicacion VARCHAR(255),
    codigo_qr VARCHAR(50) UNIQUE NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: bebidas
-- =============================================
CREATE TABLE bebidas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    imagen_url TEXT,
    categoria VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: evento_bebidas (relación)
-- =============================================
CREATE TABLE evento_bebidas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    bebida_id UUID REFERENCES bebidas(id) ON DELETE CASCADE,
    disponible BOOLEAN DEFAULT true,
    UNIQUE(evento_id, bebida_id)
);

-- =============================================
-- TABLA: pedidos
-- =============================================
CREATE TABLE pedidos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    invitado_nombre VARCHAR(255) NOT NULL,
    invitado_telefono VARCHAR(20),
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado')),
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLA: pedido_detalles
-- =============================================
CREATE TABLE pedido_detalles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
    bebida_id UUID REFERENCES bebidas(id) ON DELETE CASCADE,
    cantidad INTEGER NOT NULL DEFAULT 1
);

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX idx_eventos_empresa ON eventos(empresa_id);
CREATE INDEX idx_bebidas_empresa ON bebidas(empresa_id);
CREATE INDEX idx_pedidos_evento ON pedidos(evento_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_created ON pedidos(created_at DESC);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Empresas: solo admin puede ver/editar su empresa
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver su propia empresa"
    ON empresas FOR SELECT
    USING (id IN (
        SELECT empresa_id FROM usuarios WHERE id = auth.uid()
    ));

CREATE POLICY "Admin puede actualizar su empresa"
    ON empresas FOR UPDATE
    USING (id IN (
        SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND rol = 'admin'
    ));

-- Usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver usuarios de su empresa"
    ON usuarios FOR SELECT
    USING (empresa_id IN (
        SELECT empresa_id FROM usuarios WHERE id = auth.uid()
    ));

-- Eventos
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver eventos de su empresa"
    ON eventos FOR SELECT
    USING (empresa_id IN (
        SELECT empresa_id FROM usuarios WHERE id = auth.uid()
    ));

CREATE POLICY "Admin puede gestionar eventos"
    ON eventos FOR ALL
    USING (empresa_id IN (
        SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND rol = 'admin'
    ));

-- Bebidas
ALTER TABLE bebidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver bebidas de su empresa"
    ON bebidas FOR SELECT
    USING (empresa_id IN (
        SELECT empresa_id FROM usuarios WHERE id = auth.uid()
    ));

CREATE POLICY "Admin puede gestionar bebidas"
    ON bebidas FOR ALL
    USING (empresa_id IN (
        SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND rol = 'admin'
    ));

-- Pedidos: acceso público para invitados, resto por empresa
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invitados pueden crear pedidos"
    ON pedidos FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Invitados pueden ver sus pedidos"
    ON pedidos FOR SELECT
    USING (true);

CREATE POLICY "Bartenders pueden actualizar pedidos"
    ON pedidos FOR UPDATE
    USING (evento_id IN (
        SELECT id FROM eventos WHERE empresa_id IN (
            SELECT empresa_id FROM usuarios WHERE id = auth.uid()
        )
    ));

-- =============================================
-- FUNCIONES Y TRIGGERS
-- =============================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
 $$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_eventos_updated_at BEFORE UPDATE ON eventos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_bebidas_updated_at BEFORE UPDATE ON bebidas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_pedidos_updated_at BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función para generar código QR único
CREATE OR REPLACE FUNCTION generate_qr_code()
RETURNS VARCHAR AS $$ DECLARE
    chars VARCHAR(36) := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(50) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * 36 + 1)::integer, 1);
    END LOOP;
    RETURN 'BC-' || result;
END;
 $$ LANGUAGE plpgsql;

-- =============================================
-- FUNCIÓN PARA CREAR USUARIO TRAS REGISTRO
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$ DECLARE
    new_empresa_id UUID;
BEGIN
    -- Crear empresa si es nuevo registro
    IF NEW.raw_user_meta_data->>'is_new_company' = 'true' THEN
        INSERT INTO empresas (nombre, slug)
        VALUES (
            NEW.raw_user_meta_data->>'company_name',
            lower(regexp_replace(NEW.raw_user_meta_data->>'company_name', '[^a-zA-Z0-9]', '-', 'g'))
        )
        RETURNING id INTO new_empresa_id;
        
        INSERT INTO usuarios (id, empresa_id, nombre, email, rol)
        VALUES (NEW.id, new_empresa_id, NEW.raw_user_meta_data->>'full_name', NEW.email, 'admin');
    END IF;
    
    RETURN NEW;
END;
 $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- HABILITAR REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE pedido_detalles;

-- =============================================
-- DATOS DE PRUEBA (opcional)
-- =============================================
-- Insertar después de configurar auth