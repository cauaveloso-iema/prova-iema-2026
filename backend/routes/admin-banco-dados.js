// ============================================================================
// ROTAS DE GERENCIAMENTO DO BANCO DE DADOS (ADMIN)
// ============================================================================
// 100% DINÂMICO — Nada é hardcoded. Tudo vem do MongoDB.
//
// COLEÇÕES USADAS:
//   - modulometas     → define os módulos (agrupadores de coleções)
//   - colecaometas    → define apelido/ícone/cor/módulo de cada coleção
//
// SEED: na primeira execução, popula as duas coleções acima com os dados
//       iniciais. Depois disso, NUNCA mais é tocado pelo código.
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
// MODELOS DO MONGOOSE
// ============================================================================

// --- Modelo: Metadados dos MÓDULOS ---
let ModuloMeta;
try {
    ModuloMeta = mongoose.model('ModuloMeta');
} catch (e) {
    const schemaModulo = new mongoose.Schema({
        key:      { type: String, required: true, unique: true, trim: true },
        label:    { type: String, required: true },
        icone:    { type: String, default: 'fa-folder' },
        cor:      { type: String, default: '#94a3b8' },
        ordem:    { type: Number, default: 999 },
        ativo:    { type: Boolean, default: true },
        descricao:{ type: String, default: '' },
        padrao:   { type: Boolean, default: false }  // marca quais são seed
    }, { timestamps: true });
    ModuloMeta = mongoose.model('ModuloMeta', schemaModulo);
}

// --- Modelo: Metadados das COLEÇÕES ---
let ColecaoMeta;
try {
    ColecaoMeta = mongoose.model('ColecaoMeta');
} catch (e) {
    const schemaColecao = new mongoose.Schema({
        colecao:   { type: String, required: true, unique: true, trim: true },
        label:     { type: String, default: '' },
        icone:     { type: String, default: 'fa-cube' },
        moduloKey: { type: String, default: 'outros' },
        cor:       { type: String, default: '#94a3b8' },
        descricao: { type: String, default: '' },
        ordem:     { type: Number, default: 999 },
        padrao:    { type: Boolean, default: false },
        criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }, { timestamps: true });
    ColecaoMeta = mongoose.model('ColecaoMeta', schemaColecao);
}

// ============================================================================
// SEED INICIAL — roda UMA ÚNICA VEZ (quando o banco está vazio)
// ============================================================================
const SEED_MODULOS = [
    { key: 'usuarios',           label: 'Usuários do Sistema',           icone: 'fa-users',             cor: '#3b82f6', ordem: 1 },
    { key: 'academico',          label: 'Acadêmico',                     icone: 'fa-graduation-cap',    cor: '#8b5cf6', ordem: 2 },
    { key: 'gestao_geral',       label: 'Gestão Geral',                  icone: 'fa-user-tie',          cor: '#1e3c72', ordem: 3 },
    { key: 'coordenacao_patio',  label: 'Coordenação de Pátio',          icone: 'fa-utensils',          cor: '#f59e0b', ordem: 4 },
    { key: 'cozinha',            label: 'Cozinha',                       icone: 'fa-kitchen-set',       cor: '#d97706', ordem: 5 },
    { key: 'enfermaria',         label: 'Enfermaria',                    icone: 'fa-hospital-user',     cor: '#ec4899', ordem: 6 },
    { key: 'supervisao',         label: 'Supervisão',                    icone: 'fa-user-shield',       cor: '#1e3a8a', ordem: 7 },
    { key: 'psicologia',         label: 'Psicologia',                    icone: 'fa-brain',             cor: '#14b8a6', ordem: 8 },
    { key: 'assistente_social',  label: 'Assistente Social',             icone: 'fa-hands-helping',     cor: '#8b5cf6', ordem: 9 },
    { key: 'setor_pedagogico',   label: 'Setor Pedagógico',              icone: 'fa-chalkboard-user',   cor: '#a855f7', ordem: 10 },
    { key: 'protagonismo',       label: 'Protagonismo',                  icone: 'fa-star',              cor: '#f97316', ordem: 11 },
    { key: 'substituicoes',      label: 'Substituições de Professores',  icone: 'fa-people-arrows',     cor: '#0891b2', ordem: 12 },
    { key: 'comunicacao',        label: 'Comunicação e Eventos',         icone: 'fa-bell',              cor: '#ef4444', ordem: 13 },
    { key: 'seguranca',          label: 'Segurança e Identificação',     icone: 'fa-shield-alt',        cor: '#dc2626', ordem: 14 },
    { key: 'push',               label: 'Notificações Push',             icone: 'fa-mobile-alt',        cor: '#8b5cf6', ordem: 15 },
    { key: 'sistema',            label: 'Sistema',                       icone: 'fa-server',            cor: '#6b7280', ordem: 16 }
];

const SEED_COLECOES = [
    // usuarios
    { colecao: 'users',                     label: 'Usuários',                       icone: 'fa-user',                 moduloKey: 'usuarios',          descricao: 'Todos os usuários do sistema' },
    { colecao: 'matriculaautorizadas',      label: 'Matrículas Autorizadas',         icone: 'fa-id-card',              moduloKey: 'usuarios',          descricao: 'Matrículas liberadas para cadastro' },
    // academico
    { colecao: 'provas',                    label: 'Provas',                         icone: 'fa-file-alt',             moduloKey: 'academico',         descricao: 'Provas criadas pelos professores' },
    { colecao: 'turmas',                    label: 'Turmas',                         icone: 'fa-school',               moduloKey: 'academico',         descricao: 'Turmas do sistema' },
    { colecao: 'resultados',                label: 'Resultados',                     icone: 'fa-chart-line',           moduloKey: 'academico',         descricao: 'Resultados das provas dos alunos' },
    { colecao: 'provarealizadas',           label: 'Provas Realizadas',              icone: 'fa-check-circle',         moduloKey: 'academico',         descricao: 'Registros de provas finalizadas' },
    { colecao: 'cursos',                    label: 'Cursos',                         icone: 'fa-book',                 moduloKey: 'academico',         descricao: 'Cursos cadastrados' },
    { colecao: 'eixos',                     label: 'Eixos',                          icone: 'fa-sitemap',              moduloKey: 'academico',         descricao: 'Eixos tecnológicos' },
    // gestao_geral
    { colecao: 'autorizacoes',              label: 'Autorizações',                   icone: 'fa-map-marked-alt',       moduloKey: 'gestao_geral',      descricao: 'Autorizações de saída/visita' },
    { colecao: 'rodiziorefeicaos',          label: 'Rodízios de Refeição',           icone: 'fa-calendar-alt',         moduloKey: 'gestao_geral',      descricao: 'Configurações de rodízio por turma' },
    { colecao: 'atrasos',                   label: 'Atrasos',                        icone: 'fa-clock',                moduloKey: 'gestao_geral',      descricao: 'Registros de atrasos de alunos' },
    // coordenacao_patio
    { colecao: 'localizacoes',              label: 'Localizações/Refeições',         icone: 'fa-map-marker-alt',       moduloKey: 'coordenacao_patio', descricao: 'Registros de refeições e localizações' },
    // cozinha
    { colecao: 'refeicaos',                 label: 'Refeições Registradas',          icone: 'fa-utensils',             moduloKey: 'cozinha',           descricao: 'Controle de refeições servidas' },
    { colecao: 'feedbackrefeicoes',         label: 'Feedbacks das Refeições',        icone: 'fa-comments',             moduloKey: 'cozinha',           descricao: 'Avaliações dos alunos sobre a comida' },
    // enfermaria
    { colecao: 'atendimentoenfermarias',    label: 'Atendimentos da Enfermaria',     icone: 'fa-notes-medical',        moduloKey: 'enfermaria',        descricao: 'Atendimentos realizados na enfermaria' },
    // supervisao
    { colecao: 'atendimentossupervisaos',   label: 'Atendimentos de Supervisão',     icone: 'fa-user-shield',          moduloKey: 'supervisao',        descricao: 'Ocorrências e atendimentos da supervisão' },
    // psicologia
    { colecao: 'atendimentopsicologicos',   label: 'Atendimentos Psicológicos',      icone: 'fa-brain',                moduloKey: 'psicologia',        descricao: 'Registros de atendimento psicológico' },
    // assistente_social
    { colecao: 'atendimentoassistentesociais', label: 'Atendimentos Assist. Social', icone: 'fa-hands-helping',        moduloKey: 'assistente_social', descricao: 'Atendimentos do assistente social' },
    // setor_pedagogico
    { colecao: 'acompanhamentocompartilhado',  label: 'Acompanhamentos',             icone: 'fa-hands-holding-child',  moduloKey: 'setor_pedagogico',  descricao: 'Acompanhamentos de alunos' },
    // protagonismo
    { colecao: 'clubes',                    label: 'Clubes',                         icone: 'fa-users-rectangle',      moduloKey: 'protagonismo',      descricao: 'Clubes estudantis' },
    { colecao: 'inscricaoclubes',           label: 'Inscrições em Clubes',           icone: 'fa-file-signature',       moduloKey: 'protagonismo',      descricao: 'Inscrições dos alunos nos clubes' },
    { colecao: 'tutors',                    label: 'Tutores',                        icone: 'fa-chalkboard-user',      moduloKey: 'protagonismo',      descricao: 'Tutores cadastrados' },
    { colecao: 'candidatos',                label: 'Candidatos',                     icone: 'fa-user-tie',             moduloKey: 'protagonismo',      descricao: 'Candidatos a líder/vice-líder' },
    { colecao: 'votos',                     label: 'Votos',                          icone: 'fa-check-to-slot',        moduloKey: 'protagonismo',      descricao: 'Votos da eleição' },
    { colecao: 'configuracaoprotagonismo',  label: 'Configurações do Protagonismo',  icone: 'fa-cog',                  moduloKey: 'protagonismo',      descricao: 'Configurações do módulo Protagonismo' },
    // substituicoes
    { colecao: 'substituicoes_professores', label: 'Substituições',                  icone: 'fa-people-arrows',        moduloKey: 'substituicoes',     descricao: 'Registros de substituição de professores' },
    // comunicacao
    { colecao: 'notificacaos',              label: 'Notificações',                   icone: 'fa-bell',                 moduloKey: 'comunicacao',       descricao: 'Notificações do sistema' },
    { colecao: 'eventos',                   label: 'Eventos',                        icone: 'fa-calendar',             moduloKey: 'comunicacao',       descricao: 'Eventos do calendário acadêmico' },
    // seguranca
    { colecao: 'faceids',                   label: 'Face IDs',                       icone: 'fa-id-card',              moduloKey: 'seguranca',         descricao: 'Cadastros de reconhecimento facial' },
    { colecao: 'permissaomodulos',          label: 'Permissões de Módulos',          icone: 'fa-user-lock',            moduloKey: 'seguranca',         descricao: 'Permissões especiais por email' },
    // push
    { colecao: 'pushsettings',              label: 'Configurações Push',             icone: 'fa-cog',                  moduloKey: 'push',              descricao: 'Configurações globais de push' },
    { colecao: 'pushsubscriptions',         label: 'Inscrições Push',                icone: 'fa-mobile-alt',           moduloKey: 'push',              descricao: 'Dispositivos inscritos em push' },
    // sistema
    { colecao: 'configs',                   label: 'Configurações',                  icone: 'fa-cog',                  moduloKey: 'sistema',           descricao: 'Configurações gerais do sistema' }
];

async function seedSeNecessario() {
    try {
        const total = await ModuloMeta.countDocuments();
        if (total > 0) return; // já populado

        console.log('🌱 [BancoDados] Populando módulos iniciais...');
        await ModuloMeta.insertMany(SEED_MODULOS.map(m => ({ ...m, padrao: true, ativo: true })));

        console.log('🌱 [BancoDados] Populando metadados de coleções iniciais...');
        await ColecaoMeta.insertMany(SEED_COLECOES.map(c => ({ ...c, padrao: true })));

        console.log(`✅ [BancoDados] Seed completo: ${SEED_MODULOS.length} módulos + ${SEED_COLECOES.length} coleções`);
    } catch (error) {
        console.error('❌ [BancoDados] Erro no seed:', error.message);
    }
}

// roda em background, não bloqueia
setTimeout(seedSeNecessario, 2000);

// ============================================================================
// HELPERS
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
// HEALTH CHECK
// ============================================================================
router.get('/health', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        res.json({
            success: true,
            service: 'BancoDados',
            totalColecoesNoBanco: collections.length,
            totalModulos: await ModuloMeta.countDocuments(),
            totalMetasColecoes: await ColecaoMeta.countDocuments()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// LISTAR MÓDULOS — 100% DO BANCO
// ============================================================================
router.get('/modulos', async (req, res) => {
    try {
        const db = mongoose.connection.db;

        // 1) coleções reais no MongoDB
        const collectionsReais = await db.listCollections().toArray();
        const nomesReais = collectionsReais
            .filter(c => !c.name.startsWith('system.'))
            .map(c => c.name);

        // 2) módulos do banco
        const modulosDB = await ModuloMeta.find({ ativo: true })
            .sort({ ordem: 1, label: 1 })
            .lean();

        // 3) metas de coleções do banco
        const metasColecoes = await ColecaoMeta.find().lean();
        const metasMap = new Map(metasColecoes.map(m => [m.colecao, m]));

        // 4) montar estrutura base
        const modulosPorKey = new Map();
        modulosDB.forEach(mod => {
            modulosPorKey.set(mod.key, {
                key: mod.key,
                label: mod.label,
                icone: mod.icone,
                cor: mod.cor,
                ordem: mod.ordem,
                colecoes: [],
                totalColecoes: 0,
                totalRegistros: 0
            });
        });

        // 5) classificar cada coleção do MongoDB
        const colecoesSemModulo = [];

        for (const nomeCol of nomesReais) {
            // ignora coleções internas do próprio sistema de admin
            if (['modulometas', 'colecaometas'].includes(nomeCol.toLowerCase())) continue;

            const meta = metasMap.get(nomeCol);
            let count = 0;
            try { count = await db.collection(nomeCol).countDocuments(); } catch (e) {}

            const moduloDestino = meta?.moduloKey && modulosPorKey.has(meta.moduloKey)
                ? meta.moduloKey
                : null;

            if (moduloDestino) {
                const mod = modulosPorKey.get(moduloDestino);
                mod.colecoes.push({
                    nome: nomeCol,
                    label: meta.label || formatarLabelAutomatico(nomeCol),
                    icone: meta.icone || 'fa-cube',
                    descricao: meta.descricao || '',
                    cor: meta.cor || mod.cor,
                    totalRegistros: count,
                    temMeta: true,
                    ehCustomizada: false
                });
                mod.totalRegistros += count;
                mod.totalColecoes++;
            } else {
                // sem módulo definido → vai pra "outros"
                colecoesSemModulo.push({
                    nome: nomeCol,
                    label: meta?.label || formatarLabelAutomatico(nomeCol),
                    icone: meta?.icone || 'fa-cube',
                    descricao: meta?.descricao || 'Coleção detectada automaticamente no banco',
                    cor: meta?.cor || '#94a3b8',
                    totalRegistros: count,
                    temMeta: !!meta,
                    ehCustomizada: true
                });
            }
        }

        // 6) adicionar "Outros" se houver coleções órfãs
        if (colecoesSemModulo.length > 0) {
            let outros = modulosPorKey.get('outros');
            if (!outros) {
                outros = {
                    key: 'outros',
                    label: 'Outros (Detectados automaticamente)',
                    icone: 'fa-cubes',
                    cor: '#94a3b8',
                    ordem: 9999,
                    colecoes: [],
                    totalColecoes: 0,
                    totalRegistros: 0,
                    ehCustomizado: true
                };
                modulosPorKey.set('outros', outros);
            }
            colecoesSemModulo.sort((a, b) => a.nome.localeCompare(b.nome));
            outros.colecoes.push(...colecoesSemModulo);
            outros.totalColecoes += colecoesSemModulo.length;
            outros.totalRegistros += colecoesSemModulo.reduce((a, c) => a + c.totalRegistros, 0);
        }

        // 7) ordenar coleções dentro de cada módulo
        modulosPorKey.forEach(mod => {
            mod.colecoes.sort((a, b) => a.label.localeCompare(b.label));
        });

        const modulos = Array.from(modulosPorKey.values())
            .filter(m => m.colecoes.length > 0)
            .sort((a, b) => (a.ordem || 9999) - (b.ordem || 9999));

        res.json({ success: true, modulos, origem: 'banco' });

    } catch (error) {
        console.error('❌ Erro ao listar módulos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// LISTAR ÍCONES E MÓDULOS — 100% DO BANCO
// ============================================================================
router.get('/icones', async (req, res) => {
    try {
        const modulosDB = await ModuloMeta.find({ ativo: true })
            .sort({ ordem: 1 })
            .lean();

        const colecoesDB = await ColecaoMeta.find({
            icone: { $exists: true, $ne: '' }
        }).lean();

        // Consolidar ícones únicos
        const iconesMap = new Map();

        modulosDB.forEach(m => {
            if (m.icone && !iconesMap.has(m.icone)) {
                iconesMap.set(m.icone, {
                    icone: m.icone,
                    origem: 'modulo',
                    moduloLabel: m.label
                });
            }
        });

        colecoesDB.forEach(c => {
            if (c.icone && !iconesMap.has(c.icone)) {
                iconesMap.set(c.icone, {
                    icone: c.icone,
                    origem: 'colecao',
                    moduloKey: c.moduloKey
                });
            }
        });

        const modulosDisponiveis = modulosDB.map(m => ({
            key: m.key,
            label: m.label,
            icone: m.icone,
            cor: m.cor,
            origem: 'banco'
        }));

        // Garantir "outros"
        if (!modulosDisponiveis.find(m => m.key === 'outros')) {
            modulosDisponiveis.push({
                key: 'outros',
                label: '📁 Outros (Não Mapeados)',
                icone: 'fa-cubes',
                cor: '#94a3b8',
                origem: 'sistema'
            });
        }

        res.json({
            success: true,
            icones: Array.from(iconesMap.values()).sort((a, b) =>
                a.icone.localeCompare(b.icone)
            ),
            modulos: modulosDisponiveis,
            totalIcones: iconesMap.size,
            totalModulos: modulosDisponiveis.length,
            origem: 'banco'
        });

    } catch (error) {
        console.error('❌ Erro ao listar ícones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// METADADOS DE COLEÇÃO
// ============================================================================
router.get('/meta', async (req, res) => {
    try {
        const metas = await ColecaoMeta.find().lean();
        res.json({ success: true, metas });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
                criadoPor: req.userId
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, meta });
    } catch (error) {
        console.error('❌ Erro ao salvar meta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
// CRUD DE MÓDULOS (para criar/editar módulos pelo admin)
// ============================================================================
router.get('/admin/modulos', async (req, res) => {
    try {
        const modulos = await ModuloMeta.find().sort({ ordem: 1 }).lean();
        res.json({ success: true, modulos });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/admin/modulos', async (req, res) => {
    try {
        const { key, label, icone, cor, ordem } = req.body;
        if (!key || !label) {
            return res.status(400).json({ success: false, error: 'key e label obrigatórios' });
        }
        const keyLimpa = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const existe = await ModuloMeta.findOne({ key: keyLimpa });
        if (existe) {
            return res.status(400).json({ success: false, error: 'Módulo já existe' });
        }
        const modulo = await ModuloMeta.create({
            key: keyLimpa,
            label,
            icone: icone || 'fa-folder',
            cor: cor || '#94a3b8',
            ordem: ordem || 999,
            ativo: true
        });
        res.json({ success: true, modulo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/admin/modulos/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { label, icone, cor, ordem, ativo } = req.body;
        const modulo = await ModuloMeta.findOneAndUpdate(
            { key },
            { label, icone, cor, ordem, ativo },
            { new: true }
        );
        if (!modulo) return res.status(404).json({ success: false, error: 'Módulo não encontrado' });
        res.json({ success: true, modulo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/admin/modulos/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const vinculadas = await ColecaoMeta.countDocuments({ moduloKey: key });
        if (vinculadas > 0) {
            return res.status(400).json({
                success: false,
                error: `Este módulo tem ${vinculadas} coleção(ões) vinculada(s). Mova-as antes.`
            });
        }
        await ModuloMeta.deleteOne({ key });
        res.json({ success: true, message: 'Módulo excluído' });
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

        res.json({ success: true, total: estatisticas.length, colecoes: estatisticas });
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

        res.json({ success: true, message: 'Registro excluído', detalhes: { colecao: nome, id } });
    } catch (error) {
        console.error('❌ Erro ao excluir registro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// EXCLUSÃO EM MASSA
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

        const protegidas = ['users', 'configs'];
        if (protegidas.includes(nome) && confirmacao !== 'CONFIRMO_EXCLUSAO_CRITICA') {
            return res.status(400).json({
                success: false,
                error: `A coleção "${nome}" requer confirmação especial`,
                codigoConfirmacao: 'CONFIRMO_EXCLUSAO_CRITICA'
            });
        }

        let filtro = {};

        if (ids.length > 0) {
            filtro._id = { $in: ids.map(id => new mongoose.Types.ObjectId(id)) };
        } else if (dataInicio || dataFim) {
            filtro.createdAt = {};
            if (dataInicio) filtro.createdAt.$gte = new Date(dataInicio);
            if (dataFim) filtro.createdAt.$lte = new Date(dataFim + 'T23:59:59');
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

        const protegidas = ['users', 'configs', 'permissaomodulos'];
        if (protegidas.includes(nome)) {
            return res.status(403).json({
                success: false,
                error: `A coleção "${nome}" é protegida e não pode ser limpa`
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