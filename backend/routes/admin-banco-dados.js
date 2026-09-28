// ============================================================================
// ROTAS DE GERENCIAMENTO DO BANCO DE DADOS (ADMIN)
// ============================================================================
// Descrição: Permite ao admin visualizar, filtrar e excluir dados de todas
//            as coleções do banco de dados organizadas por módulo
// Recursos: Auto-detecção de coleções novas + metadados editáveis
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// ============================================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================================================
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }
        req.userId = user.id;
        req.userRole = user.role;
        next();
    });
};

router.use(authenticateAdmin);

// ============================================================================
// MODELO: Metadados de coleções customizadas
// Armazena apelidos/ícones/módulos de coleções novas
// ============================================================================
let ColecaoMeta = null;
try {
    ColecaoMeta = mongoose.model('ColecaoMeta');
} catch (e) {
    const schema = new mongoose.Schema({
        colecao: { type: String, required: true, unique: true },
        label: { type: String, default: '' },
        icone: { type: String, default: 'fa-cube' },
        moduloKey: { type: String, default: 'outros' },
        cor: { type: String, default: '#94a3b8' },
        descricao: { type: String, default: '' },
        criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }, { timestamps: true });
    ColecaoMeta = mongoose.model('ColecaoMeta', schema);
}

// ============================================================================
// MAPA DE COLEÇÕES POR MÓDULO - BASEADO NO BANCO REAL (provas_online)
// ============================================================================
const MODULOS_MAPA = {
    usuarios: {
        label: 'Usuários do Sistema',
        icone: 'fa-users',
        cor: '#3b82f6',
        colecoes: [
            { nome: 'users', label: 'Usuários', icone: 'fa-user', descricao: 'Todos os usuários do sistema' },
            { nome: 'matriculaautorizadas', label: 'Matrículas Autorizadas', icone: 'fa-id-card', descricao: 'Matrículas liberadas para cadastro' }
        ]
    },
    academico: {
        label: 'Acadêmico',
        icone: 'fa-graduation-cap',
        cor: '#8b5cf6',
        colecoes: [
            { nome: 'provas', label: 'Provas', icone: 'fa-file-alt', descricao: 'Provas criadas pelos professores' },
            { nome: 'turmas', label: 'Turmas', icone: 'fa-school', descricao: 'Turmas do sistema' },
            { nome: 'resultados', label: 'Resultados', icone: 'fa-chart-line', descricao: 'Resultados das provas dos alunos' },
            { nome: 'provarealizadas', label: 'Provas Realizadas', icone: 'fa-check-circle', descricao: 'Registros de provas finalizadas' },
            { nome: 'cursos', label: 'Cursos', icone: 'fa-book', descricao: 'Cursos cadastrados' },
            { nome: 'eixos', label: 'Eixos', icone: 'fa-sitemap', descricao: 'Eixos tecnológicos' }
        ]
    },
    gestao_geral: {
        label: 'Gestão Geral',
        icone: 'fa-user-tie',
        cor: '#1e3c72',
        colecoes: [
            { nome: 'autorizacoes', label: 'Autorizações', icone: 'fa-map-marked-alt', descricao: 'Autorizações de saída/visita' },
            { nome: 'rodiziorefeicaos', label: 'Rodízios de Refeição', icone: 'fa-calendar-alt', descricao: 'Configurações de rodízio por turma' },
            { nome: 'atrasos', label: 'Atrasos', icone: 'fa-clock', descricao: 'Registros de atrasos de alunos' }
        ]
    },
    coordenacao_patio: {
        label: 'Coordenação de Pátio',
        icone: 'fa-utensils',
        cor: '#f59e0b',
        colecoes: [
            { nome: 'localizacoes', label: 'Localizações/Refeições', icone: 'fa-map-marker-alt', descricao: 'Registros de refeições e localizações' }
        ]
    },
    cozinha: {
        label: 'Cozinha',
        icone: 'fa-kitchen-set',
        cor: '#d97706',
        colecoes: [
            { nome: 'refeicaos', label: 'Refeições Registradas', icone: 'fa-utensils', descricao: 'Controle de refeições servidas' },
            { nome: 'feedbackrefeicoes', label: 'Feedbacks das Refeições', icone: 'fa-comments', descricao: 'Avaliações dos alunos sobre a comida' }
        ]
    },
    enfermaria: {
        label: 'Enfermaria',
        icone: 'fa-hospital-user',
        cor: '#ec4899',
        colecoes: [
            { nome: 'atendimentoenfermarias', label: 'Atendimentos da Enfermaria', icone: 'fa-notes-medical', descricao: 'Atendimentos realizados na enfermaria' }
        ]
    },
    supervisao: {
        label: 'Supervisão',
        icone: 'fa-user-shield',
        cor: '#1e3a8a',
        colecoes: [
            { nome: 'atendimentossupervisaos', label: 'Atendimentos de Supervisão', icone: 'fa-user-shield', descricao: 'Ocorrências e atendimentos da supervisão' }
        ]
    },
    psicologia: {
        label: 'Psicologia',
        icone: 'fa-brain',
        cor: '#14b8a6',
        colecoes: [
            { nome: 'atendimentopsicologicos', label: 'Atendimentos Psicológicos', icone: 'fa-brain', descricao: 'Registros de atendimento psicológico' }
        ]
    },
    assistente_social: {
        label: 'Assistente Social',
        icone: 'fa-hands-helping',
        cor: '#8b5cf6',
        colecoes: [
            { nome: 'atendimentoassistentesociais', label: 'Atendimentos Assist. Social', icone: 'fa-hands-helping', descricao: 'Atendimentos do assistente social' }
        ]
    },
    setor_pedagogico: {
        label: 'Setor Pedagógico',
        icone: 'fa-chalkboard-user',
        cor: '#a855f7',
        colecoes: [
            { nome: 'acompanhamentocompartilhado', label: 'Acompanhamentos', icone: 'fa-hands-holding-child', descricao: 'Acompanhamentos de alunos' }
        ]
    },
    protagonismo: {
        label: 'Protagonismo',
        icone: 'fa-star',
        cor: '#f97316',
        colecoes: [
            { nome: 'clubes', label: 'Clubes', icone: 'fa-users-rectangle', descricao: 'Clubes estudantis' },
            { nome: 'inscricaoclubes', label: 'Inscrições em Clubes', icone: 'fa-file-signature', descricao: 'Inscrições dos alunos nos clubes' },
            { nome: 'tutors', label: 'Tutores', icone: 'fa-chalkboard-user', descricao: 'Tutores cadastrados' },
            { nome: 'candidatos', label: 'Candidatos', icone: 'fa-user-tie', descricao: 'Candidatos a líder/vice-líder' },
            { nome: 'votos', label: 'Votos', icone: 'fa-check-to-slot', descricao: 'Votos da eleição' },
            { nome: 'configuracaoprotagonismo', label: 'Configurações do Protagonismo', icone: 'fa-cog', descricao: 'Configurações do módulo Protagonismo' }
        ]
    },
    substituicoes: {
        label: 'Substituições de Professores',
        icone: 'fa-people-arrows',
        cor: '#0891b2',
        colecoes: [
            { nome: 'substituicoes_professores', label: 'Substituições', icone: 'fa-people-arrows', descricao: 'Registros de substituição de professores' }
        ]
    },
    comunicacao: {
        label: 'Comunicação e Eventos',
        icone: 'fa-bell',
        cor: '#ef4444',
        colecoes: [
            { nome: 'notificacaos', label: 'Notificações', icone: 'fa-bell', descricao: 'Notificações do sistema' },
            { nome: 'eventos', label: 'Eventos', icone: 'fa-calendar', descricao: 'Eventos do calendário acadêmico' }
        ]
    },
    seguranca: {
        label: 'Segurança e Identificação',
        icone: 'fa-shield-alt',
        cor: '#dc2626',
        colecoes: [
            { nome: 'faceids', label: 'Face IDs', icone: 'fa-id-card', descricao: 'Cadastros de reconhecimento facial' },
            { nome: 'permissaomodulos', label: 'Permissões de Módulos', icone: 'fa-user-lock', descricao: 'Permissões especiais por email' }
        ]
    },
    push: {
        label: 'Notificações Push',
        icone: 'fa-mobile-alt',
        cor: '#8b5cf6',
        colecoes: [
            { nome: 'pushsettings', label: 'Configurações Push', icone: 'fa-cog', descricao: 'Configurações globais de push' },
            { nome: 'pushsubscriptions', label: 'Inscrições Push', icone: 'fa-mobile-alt', descricao: 'Dispositivos inscritos em push' }
        ]
    },
    sistema: {
        label: 'Sistema',
        icone: 'fa-server',
        cor: '#6b7280',
        colecoes: [
            { nome: 'configs', label: 'Configurações', icone: 'fa-cog', descricao: 'Configurações gerais do sistema' }
        ]
    }
};

// ============================================================================
// FUNÇÃO: Formatar nome de coleção automaticamente
// ============================================================================
function formatarLabelAutomatico(nome) {
    return nome
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .filter(p => p.length > 0)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
}

// ============================================================================
// FUNÇÃO: Obter meta de uma coleção
// ============================================================================
async function getMetaColecao(nomeCol) {
    if (!ColecaoMeta) return null;
    try {
        return await ColecaoMeta.findOne({ colecao: nomeCol }).lean();
    } catch (e) {
        return null;
    }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        res.json({
            success: true,
            service: 'BancoDados',
            totalColecoes: collections.length,
            colecoes: collections.map(c => c.name).sort()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// LISTAR MÓDULOS AGRUPADOS (COM DETECÇÃO AUTOMÁTICA)
// ============================================================================
router.get('/modulos', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collectionsReais = await db.listCollections().toArray();
        const nomesReais = collectionsReais
            .filter(c => !c.name.startsWith('system.'))
            .map(c => c.name);

        const modulos = [];
        const colecoesMapeadas = new Set();

        // 1. Processar módulos do mapa
        for (const [key, mod] of Object.entries(MODULOS_MAPA)) {
            const colecoesExistentes = [];
            let totalRegistros = 0;

            for (const col of mod.colecoes) {
                if (nomesReais.includes(col.nome)) {
                    try {
                        const count = await db.collection(col.nome).countDocuments();
                        colecoesExistentes.push({ ...col, totalRegistros: count });
                        totalRegistros += count;
                        colecoesMapeadas.add(col.nome);
                    } catch (e) {
                        colecoesExistentes.push({ ...col, totalRegistros: 0 });
                        colecoesMapeadas.add(col.nome);
                    }
                }
            }

            modulos.push({
                key,
                label: mod.label,
                icone: mod.icone,
                cor: mod.cor,
                colecoes: colecoesExistentes,
                totalColecoes: colecoesExistentes.length,
                totalRegistros
            });
        }

        // 2. Detectar coleções NÃO MAPEADAS
        const colecoesNaoMapeadas = [];
        for (const nomeCol of nomesReais) {
            if (!colecoesMapeadas.has(nomeCol)) {
                try {
                    const count = await db.collection(nomeCol).countDocuments();
                    const meta = await getMetaColecao(nomeCol);

                    colecoesNaoMapeadas.push({
                        nome: nomeCol,
                        label: meta?.label || formatarLabelAutomatico(nomeCol),
                        icone: meta?.icone || 'fa-cube',
                        descricao: meta?.descricao || 'Coleção detectada automaticamente',
                        totalRegistros: count,
                        moduloKeyCustom: meta?.moduloKey || 'outros',
                        corCustom: meta?.cor || '#94a3b8',
                        temMeta: !!meta,
                        ehCustomizada: true
                    });
                } catch (e) {}
            }
        }

        // 3. Agrupar por moduloKey customizado
        const gruposCustom = {};
        for (const col of colecoesNaoMapeadas) {
            const key = col.moduloKeyCustom || 'outros';
            if (!gruposCustom[key]) {
                gruposCustom[key] = [];
            }
            gruposCustom[key].push(col);
        }

        // 4. Adicionar módulos customizados
        for (const [key, cols] of Object.entries(gruposCustom)) {
            const totalRegistros = cols.reduce((acc, c) => acc + c.totalRegistros, 0);
            modulos.push({
                key: key === 'outros' ? 'outros' : `custom_${key}`,
                label: key === 'outros' ? 'Outros (Não Mapeados)' : `📁 ${key}`,
                icone: 'fa-cubes',
                cor: '#94a3b8',
                colecoes: cols.sort((a, b) => a.nome.localeCompare(b.nome)),
                totalColecoes: cols.length,
                totalRegistros,
                ehCustomizado: true
            });
        }

        res.json({
            success: true,
            modulos: modulos.filter(m => m.colecoes.length > 0)
        });
    } catch (error) {
        console.error('❌ Erro ao listar módulos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// METADADOS - LISTAR
// ============================================================================
router.get('/meta', async (req, res) => {
    try {
        const metas = await ColecaoMeta.find().lean();
        res.json({ success: true, metas });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// METADADOS - SALVAR / ATUALIZAR
// ============================================================================
router.put('/meta/:colecao', async (req, res) => {
    try {
        const { colecao } = req.params;
        const { label, icone, moduloKey, cor, descricao } = req.body;

        const meta = await ColecaoMeta.findOneAndUpdate(
            { colecao },
            {
                colecao,
                label: label || formatarLabelAutomatico(colecao),
                icone: icone || 'fa-cube',
                moduloKey: moduloKey || 'outros',
                cor: cor || '#94a3b8',
                descricao: descricao || '',
                criadoPor: req.userId,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ [BancoDados] Metadados salvos para ${colecao}`);

        res.json({ success: true, meta });
    } catch (error) {
        console.error('❌ Erro ao salvar metadados:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// METADADOS - EXCLUIR
// ============================================================================
router.delete('/meta/:colecao', async (req, res) => {
    try {
        const { colecao } = req.params;
        await ColecaoMeta.deleteOne({ colecao });
        res.json({ success: true, message: 'Metadados removidos' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// LISTAR TODAS AS COLEÇÕES
// ============================================================================
router.get('/colecoes', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        const estatisticas = [];
        for (const col of collections) {
            try {
                const count = await db.collection(col.name).countDocuments();
                const stats = await db.command({ collStats: col.name }).catch(() => null);
                estatisticas.push({
                    nome: col.name,
                    totalRegistros: count,
                    tamanho: stats ? (stats.size / 1024 / 1024).toFixed(2) + ' MB' : '0 MB'
                });
            } catch (e) {}
        }

        estatisticas.sort((a, b) => a.nome.localeCompare(b.nome));

        res.json({
            success: true,
            total: estatisticas.length,
            colecoes: estatisticas
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// LISTAR REGISTROS DE UMA COLEÇÃO
// ============================================================================
router.get('/colecao/:nome', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const { nome } = req.params;
        const { page = 1, limit = 20, search = '', dataInicio = '', dataFim = '' } = req.query;

        const collections = await db.listCollections().toArray();
        if (!collections.find(c => c.name === nome)) {
            return res.status(404).json({ success: false, error: 'Coleção não encontrada' });
        }

        const filtro = {};

        if (search && search.trim()) {
            filtro.$or = [
                { nome: { $regex: search, $options: 'i' } },
                { titulo: { $regex: search, $options: 'i' } },
                { descricao: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { matricula: { $regex: search, $options: 'i' } }
            ];
        }

        if (dataInicio || dataFim) {
            filtro.createdAt = {};
            if (dataInicio) filtro.createdAt.$gte = new Date(dataInicio);
            if (dataFim) filtro.createdAt.$lte = new Date(dataFim + 'T23:59:59');
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [registros, total] = await Promise.all([
            db.collection(nome).find(filtro).sort({ _id: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
            db.collection(nome).countDocuments(filtro)
        ]);

        const campos = new Set();
        registros.slice(0, 5).forEach(r => {
            Object.keys(r).forEach(k => campos.add(k));
        });

        res.json({
            success: true,
            colecao: nome,
            registros,
            total,
            campos: Array.from(campos),
            paginacao: {
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error(`❌ Erro ao listar ${req.params.nome}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// EXCLUIR REGISTRO
// ============================================================================
router.delete('/colecao/:nome/registro/:id', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const { nome, id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        if (nome === 'users') {
            const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(id) });
            if (user && (user.role === 'admin' || user.role === 'super_admin')) {
                return res.status(403).json({
                    success: false,
                    error: 'Não é possível excluir administradores por esta interface'
                });
            }
        }

        const resultado = await db.collection(nome).deleteOne({ _id: new mongoose.Types.ObjectId(id) });

        if (resultado.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'Registro não encontrado' });
        }

        console.log(`🗑️ Registro ${id} excluído de ${nome} por ${req.userId}`);

        res.json({
            success: true,
            message: 'Registro excluído com sucesso',
            detalhes: { colecao: nome, id }
        });
    } catch (error) {
        console.error('❌ Erro ao excluir registro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// EXCLUIR EM MASSA
// ============================================================================
router.post('/colecao/:nome/excluir-massa', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const { nome } = req.params;
        const { dataInicio = '', dataFim = '', ids = [], confirmacao = '' } = req.body;

        const collections = await db.listCollections().toArray();
        if (!collections.find(c => c.name === nome)) {
            return res.status(404).json({ success: false, error: 'Coleção não encontrada' });
        }

        const colecoesProtegidas = ['users', 'configs'];
        if (colecoesProtegidas.includes(nome) && confirmacao !== 'CONFIRMO_EXCLUSAO_CRITICA') {
            return res.status(400).json({
                success: false,
                error: `A coleção "${nome}" requer confirmação especial`,
                codigoConfirmacao: 'CONFIRMO_EXCLUSAO_CRITICA'
            });
        }

        let filtro = {};

        if (ids.length > 0) {
            filtro._id = { $in: ids.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
            if (dataInicio || dataFim) {
                filtro.createdAt = {};
                if (dataInicio) filtro.createdAt.$gte = new Date(dataInicio);
                if (dataFim) filtro.createdAt.$lte = new Date(dataFim + 'T23:59:59');
            }
        }

        const totalAntes = await db.collection(nome).countDocuments(filtro);

        if (totalAntes > 50 && confirmacao !== 'CONFIRMO_EXCLUSAO_MASSA') {
            return res.status(400).json({
                success: false,
                error: `Exclusão de ${totalAntes} registros requer confirmação`,
                total: totalAntes,
                codigoConfirmacao: 'CONFIRMO_EXCLUSAO_MASSA'
            });
        }

        const resultado = await db.collection(nome).deleteMany(filtro);

        console.log(`🗑️ ${resultado.deletedCount} registros excluídos de ${nome}`);

        res.json({
            success: true,
            message: `${resultado.deletedCount} registro(s) excluído(s)`,
            totalExcluidos: resultado.deletedCount
        });
    } catch (error) {
        console.error('❌ Erro na exclusão em massa:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// LIMPAR COLEÇÃO
// ============================================================================
router.post('/colecao/:nome/limpar', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const { nome } = req.params;
        const { confirmacao = '' } = req.body;

        const collections = await db.listCollections().toArray();
        if (!collections.find(c => c.name === nome)) {
            return res.status(404).json({ success: false, error: 'Coleção não encontrada' });
        }

        const colecoesProtegidas = ['users', 'configs', 'permissaomodulos'];
        if (colecoesProtegidas.includes(nome)) {
            return res.status(403).json({
                success: false,
                error: `A coleção "${nome}" é protegida e não pode ser limpa completamente`
            });
        }

        if (confirmacao !== `LIMPAR_${nome.toUpperCase()}`) {
            return res.status(400).json({
                success: false,
                error: 'Confirmação inválida',
                codigoConfirmacao: `LIMPAR_${nome.toUpperCase()}`
            });
        }

        const totalAntes = await db.collection(nome).countDocuments();
        const resultado = await db.collection(nome).deleteMany({});

        console.log(`🗑️ LIMPEZA TOTAL: ${resultado.deletedCount} registros removidos de ${nome}`);

        res.json({
            success: true,
            message: `Coleção "${nome}" limpa: ${resultado.deletedCount} registros removidos`,
            totalRemovidos: resultado.deletedCount,
            totalAntes
        });
    } catch (error) {
        console.error('❌ Erro ao limpar coleção:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ESTATÍSTICAS
// ============================================================================
router.get('/estatisticas', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        let totalRegistros = 0;
        const porColecao = [];

        for (const col of collections) {
            try {
                const count = await db.collection(col.name).countDocuments();
                const stats = await db.command({ collStats: col.name }).catch(() => null);
                totalRegistros += count;
                porColecao.push({
                    nome: col.name,
                    total: count,
                    tamanho: stats ? (stats.size / 1024 / 1024).toFixed(2) : '0'
                });
            } catch (e) {}
        }

        let tamanhoBanco = '0 MB';
        try {
            const stats = await db.stats();
            tamanhoBanco = (stats.dataSize / 1024 / 1024).toFixed(2) + ' MB';
        } catch (e) {}

        res.json({
            success: true,
            estatisticas: {
                totalColecoes: collections.length,
                totalRegistros,
                tamanhoBanco,
                porColecao: porColecao.sort((a, b) => b.total - a.total)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

console.log('✅ [BancoDados] Rota carregada com sucesso');

module.exports = router;