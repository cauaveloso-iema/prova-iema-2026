// routes/gestao-professores-routes.js
// Rotas para Gestão de Professores - Setor Pedagógico
// ⚠️ VERSÃO 2.1 — Relatórios corrigidos (por professor, turma, eixo com nomes de componentes)
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

function getGestaoProfessorModel() { return require('../models/GestaoProfessor'); }
function getUserModel() { return require('../models/User'); }
function getPermissaoModuloModel() { return require('../models/PermissaoModulo'); }

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const User = getUserModel();
        const user = await User.findById(decoded.id).select('email nome role');
        
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        
        req.userId = user._id;
        req.userRole = user.role;
        req.userNome = user.nome;
        req.userEmail = user.email;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Token inválido' });
    }
};

const verificarPermissaoModulo = async (req, res, next) => {
    try {
        if (req.userRole === 'admin' || req.userRole === 'super_admin') {
            return next();
        }
        
        const PermissaoModulo = getPermissaoModuloModel();
        const permissao = await PermissaoModulo.findOne({ 
            modulo: 'gestao_professores_setor_pedagogico',
            ativo: true
        });
        
        if (!permissao) {
            return res.status(403).json({ success: false, error: 'Módulo não configurado' });
        }
        
        const emailNormalizado = (req.userEmail || '').trim().toLowerCase();
        const emailsAutorizados = permissao.emailsAutorizados.map(e => (e || '').trim().toLowerCase());
        
        if (!emailsAutorizados.includes(emailNormalizado)) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }
        
        next();
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// HELPERS
// ============================================
function sanitizarString(str) {
    if (str === undefined || str === null) return '';
    return String(str).trim();
}

function parseIntSeguro(valor, padrao = 0) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const n = parseInt(valor, 10);
    return isNaN(n) ? padrao : n;
}

// Normaliza aulasRegistradas (compatibilidade com formato antigo periodo1..4)
function normalizarAulas(aulas) {
    if (aulas === null || aulas === undefined) return 0;
    if (typeof aulas === 'number') return isNaN(aulas) ? 0 : aulas;
    if (typeof aulas === 'string') {
        const n = parseInt(aulas, 10);
        return isNaN(n) ? 0 : n;
    }
    if (typeof aulas === 'object') {
        const p1 = parseInt(aulas.periodo1, 10) || 0;
        const p2 = parseInt(aulas.periodo2, 10) || 0;
        const p3 = parseInt(aulas.periodo3, 10) || 0;
        const p4 = parseInt(aulas.periodo4, 10) || 0;
        return p1 + p2 + p3 + p4;
    }
    return 0;
}

// Detecta período legado (para registros antigos)
function detectarPeriodoLegado(aulas) {
    if (!aulas || typeof aulas !== 'object') return null;
    if ((parseInt(aulas.periodo1, 10) || 0) > 0) return '1';
    if ((parseInt(aulas.periodo2, 10) || 0) > 0) return '2';
    if ((parseInt(aulas.periodo3, 10) || 0) > 0) return '3';
    if ((parseInt(aulas.periodo4, 10) || 0) > 0) return '4';
    return null;
}

// Normaliza um componente antes de gravar
function normalizarComponentePayload(c) {
    const aulasRaw = c.aulasRegistradas;
    let periodo = sanitizarString(c.periodo);
    
    if (!periodo) {
        const legado = detectarPeriodoLegado(aulasRaw);
        if (legado) periodo = legado;
    }
    
    return {
        componenteCurricularId: c.componenteCurricularId || null,
        nome: sanitizarString(c.nome),
        eixo: sanitizarString(c.eixo),
        turma: sanitizarString(c.turma),
        curso: sanitizarString(c.curso),
        periodo: periodo || null,
        aulasRegistradas: normalizarAulas(aulasRaw),
        cargaHorariaAnual: parseIntSeguro(c.cargaHorariaAnual, 0),
        cargaHorariaSemanal: parseIntSeguro(c.cargaHorariaSemanal, 0),
        observacoes: sanitizarString(c.observacoes)
    };
}

// ============================================
// ROTAS
// ============================================

// ============================================
// GET /professores
// ============================================
router.get('/professores', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const { busca, eixo } = req.query;
        
        let filtro = { role: 'professor', ativo: true };
        
        if (eixo) filtro.eixo = eixo;
        
        if (busca) {
            filtro.$or = [
                { nome: { $regex: busca, $options: 'i' } },
                { email: { $regex: busca, $options: 'i' } },
                { matricula: { $regex: busca, $options: 'i' } },
                { cpf: { $regex: busca, $options: 'i' } }
            ];
        }
        
        const professores = await User.find(filtro)
            .select('_id nome email cpf telefone matricula eixo departamento titulacao ativo fotoPerfil')
            .sort({ nome: 1 })
            .lean();
        
        res.json({
            success: true,
            professores: professores.map(p => ({
                id: p._id,
                nome: p.nome,
                email: p.email || '',
                cpf: p.cpf || '',
                telefone: p.telefone || '',
                matricula: p.matricula || '',
                eixo: p.eixo || '',
                departamento: p.departamento || '',
                titulacao: p.titulacao || '',
                ativo: p.ativo !== false,
                fotoPerfil: p.fotoPerfil || null
            })),
            total: professores.length
        });
    } catch (error) {
        console.error('❌ Erro ao listar professores:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET /professores/:id
// ============================================
router.get('/professores/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        
        const professor = await User.findById(id)
            .select('_id nome email cpf telefone matricula eixo departamento titulacao ativo fotoPerfil bio dataNascimento endereco cidade estado cep')
            .lean();
        
        if (!professor) {
            return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        }
        
        res.json({
            success: true,
            professor: {
                id: professor._id,
                nome: professor.nome,
                email: professor.email || '',
                cpf: professor.cpf || '',
                telefone: professor.telefone || '',
                matricula: professor.matricula || '',
                eixo: professor.eixo || '',
                departamento: professor.departamento || '',
                titulacao: professor.titulacao || '',
                ativo: professor.ativo !== false,
                fotoPerfil: professor.fotoPerfil || null,
                bio: professor.bio || '',
                endereco: professor.endereco || '',
                cidade: professor.cidade || '',
                estado: professor.estado || '',
                cep: professor.cep || ''
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar professor:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET /turmas
// ============================================
router.get('/turmas', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        
        const turmas = await User.aggregate([
            { 
                $match: { 
                    role: 'aluno', 
                    ativo: true, 
                    turma: { $exists: true, $nin: [null, ''] } 
                } 
            },
            {
                $group: {
                    _id: '$turma',
                    curso: { $first: '$curso' }
                }
            },
            {
                $project: {
                    _id: 0,
                    turma: '$_id',
                    curso: { $ifNull: ['$curso', 'Não informado'] }
                }
            },
            { $sort: { turma: 1 } }
        ]);
        
        res.json({
            success: true,
            turmas: turmas.map(t => ({
                turma: t.turma,
                curso: t.curso || 'Não informado'
            })),
            total: turmas.length
        });
    } catch (error) {
        console.error('❌ Erro ao listar turmas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET /componentes-curriculares
// ============================================
router.get('/componentes-curriculares', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        let componentes = [];
        
        try {
            const ComponenteCurricular = require('../models/ComponenteCurricular');
            componentes = await ComponenteCurricular.find({ ativo: true })
                .select('nome eixo')
                .sort({ eixo: 1, nome: 1 })
                .lean();
        } catch (e) {
            try {
                const Disciplina = require('../models/Disciplina');
                componentes = await Disciplina.find({ ativo: true })
                    .select('nome eixo')
                    .sort({ eixo: 1, nome: 1 })
                    .lean();
            } catch (e2) {
                console.warn('⚠️ Nenhum model de Componente/Disciplina encontrado');
            }
        }
        
        const porEixo = {};
        componentes.forEach(c => {
            const eixo = c.eixo || 'Sem Eixo';
            if (!porEixo[eixo]) porEixo[eixo] = [];
            porEixo[eixo].push({
                id: c._id,
                nome: c.nome,
                eixo: eixo
            });
        });
        
        res.json({
            success: true,
            componentes: componentes.map(c => ({
                id: c._id,
                nome: c.nome,
                eixo: c.eixo || 'Sem Eixo'
            })),
            porEixo: porEixo,
            eixos: Object.keys(porEixo),
            total: componentes.length
        });
    } catch (error) {
        console.error('❌ Erro ao listar componentes:', error);
        res.json({ success: true, componentes: [], porEixo: {}, eixos: [], total: 0 });
    }
});

// ============================================
// GET /eixos
// ============================================
router.get('/eixos', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        let eixos = [];
        
        try {
            const Eixo = require('../models/Eixo');
            eixos = await Eixo.find({ ativo: true })
                .select('nome label cor icone')
                .sort({ label: 1 })
                .lean();
        } catch (e) {
            try {
                const ComponenteCurricular = require('../models/ComponenteCurricular');
                const eixosUnicos = await ComponenteCurricular.distinct('eixo');
                eixos = eixosUnicos.filter(e => e).map(e => ({ nome: e, label: e }));
            } catch (e2) {
                console.warn('⚠️ Nenhum model de Eixo encontrado');
            }
        }
        
        res.json({
            success: true,
            eixos: eixos.map(e => ({
                id: e._id,
                nome: e.nome,
                label: e.label || e.nome,
                cor: e.cor || '#6366f1',
                icone: e.icone || 'fa-graduation-cap'
            })),
            total: eixos.length
        });
    } catch (error) {
        console.error('❌ Erro ao listar eixos:', error);
        res.json({ success: true, eixos: [], total: 0 });
    }
});

// ============================================
// GET /periodos
// ============================================
router.get('/periodos', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        let periodos = [];
        
        try {
            const Periodo = require('../models/Periodo');
            periodos = await Periodo.find({ ativo: true })
                .select('nome label ordem')
                .sort({ ordem: 1 })
                .lean();
        } catch (e) {
            console.log('ℹ️ Model Periodo não encontrado, usando fallback');
        }
        
        if (periodos.length === 0) {
            periodos = [
                { id: '1', nome: '1', label: '1º Período' },
                { id: '2', nome: '2', label: '2º Período' },
                { id: '3', nome: '3', label: '3º Período' },
                { id: '4', nome: '4', label: '4º Período' }
            ];
        } else {
            periodos = periodos.map(p => ({
                id: String(p._id || p.nome),
                nome: p.nome || p.label,
                label: p.label || p.nome
            }));
        }
        
        res.json({
            success: true,
            periodos,
            total: periodos.length
        });
    } catch (error) {
        console.error('❌ Erro ao listar períodos:', error);
        res.json({
            success: true,
            periodos: [
                { id: '1', nome: '1', label: '1º Período' },
                { id: '2', nome: '2', label: '2º Período' },
                { id: '3', nome: '3', label: '3º Período' },
                { id: '4', nome: '4', label: '4º Período' }
            ],
            total: 4
        });
    }
});

// ============================================
// POST /registrar
// ============================================
router.post('/registrar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const GestaoProfessor = getGestaoProfessorModel();
        const User = getUserModel();
        
        const {
            professorId,
            turmasVinculadas,
            componentes,
            dataColeta,
            observacoesGerais
        } = req.body;
        
        if (!professorId) return res.status(400).json({ success: false, error: 'Professor é obrigatório' });
        if (!dataColeta) return res.status(400).json({ success: false, error: 'Data da coleta é obrigatória' });
        if (!componentes || !Array.isArray(componentes) || componentes.length === 0) {
            return res.status(400).json({ success: false, error: 'Pelo menos um componente curricular é obrigatório' });
        }
        
        const professor = await User.findById(professorId)
            .select('nome email cpf telefone matricula eixo departamento titulacao')
            .lean();
        
        if (!professor) return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        
        for (let i = 0; i < componentes.length; i++) {
            const c = componentes[i];
            if (!c.nome) return res.status(400).json({ success: false, error: `Componente ${i + 1}: nome é obrigatório` });
            if (!c.turma) return res.status(400).json({ success: false, error: `Componente ${i + 1}: turma é obrigatória` });
            if (!c.periodo && !detectarPeriodoLegado(c.aulasRegistradas)) {
                return res.status(400).json({ success: false, error: `Componente ${i + 1}: período é obrigatório` });
            }
        }
        
        const dataColetaObj = new Date(dataColeta + 'T12:00:00');
        
        const novoRegistro = new GestaoProfessor({
            professorId: professor._id,
            professorNome: professor.nome,
            professorEmail: professor.email || '',
            professorMatricula: professor.matricula || '',
            professorEixo: professor.eixo || '',
            professorTelefone: professor.telefone || '',
            professorCPF: professor.cpf || '',
            professorDepartamento: professor.departamento || '',
            professorTitulacao: professor.titulacao || '',
            turmasVinculadas: (turmasVinculadas || []).map(t => ({
                turma: sanitizarString(t.turma),
                curso: sanitizarString(t.curso)
            })),
            componentes: componentes.map(normalizarComponentePayload),
            dataColeta: dataColetaObj,
            observacoesGerais: sanitizarString(observacoesGerais),
            registradoPor: req.userId,
            registradoPorNome: req.userNome,
            registradoPorEmail: req.userEmail
        });
        
        await novoRegistro.save();
        
        console.log(`✅ Gestão de professor registrada: ${professor.nome}`);
        
        res.status(201).json({
            success: true,
            message: 'Gestão de professor registrada com sucesso!',
            registro: novoRegistro
        });
        
    } catch (error) {
        console.error('❌ Erro ao registrar gestão:', error);
        if (error.name === 'ValidationError') {
            const msgs = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ success: false, error: msgs.join('; ') });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET /listar
// ============================================
router.get('/listar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const GestaoProfessor = getGestaoProfessorModel();
        const { 
            busca, eixo, turma, periodo, professorId,
            dataInicio, dataFim,
            limit = 50, page = 1 
        } = req.query;
        
        let filtro = { ativo: true };
        
        if (busca) {
            filtro.$or = [
                { professorNome: { $regex: busca, $options: 'i' } },
                { professorMatricula: { $regex: busca, $options: 'i' } },
                { 'componentes.nome': { $regex: busca, $options: 'i' } }
            ];
        }
        
        if (eixo) filtro['componentes.eixo'] = eixo;
        if (turma) filtro['componentes.turma'] = turma;
        if (periodo) filtro['componentes.periodo'] = String(periodo);
        if (professorId) filtro.professorId = professorId;
        
        if (dataInicio || dataFim) {
            filtro.dataColeta = {};
            if (dataInicio) filtro.dataColeta.$gte = new Date(dataInicio + 'T00:00:00');
            if (dataFim) filtro.dataColeta.$lte = new Date(dataFim + 'T23:59:59');
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [registros, total] = await Promise.all([
            GestaoProfessor.find(filtro)
                .sort({ dataColeta: -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            GestaoProfessor.countDocuments(filtro)
        ]);
        
        res.json({
            success: true,
            registros: registros.map(r => ({
                id: r._id,
                professorId: r.professorId,
                professorNome: r.professorNome,
                professorEmail: r.professorEmail,
                professorMatricula: r.professorMatricula,
                professorEixo: r.professorEixo,
                turmasVinculadas: r.turmasVinculadas || [],
                componentes: (r.componentes || []).map(c => ({
                    _id: c._id,
                    componenteCurricularId: c.componenteCurricularId,
                    nome: c.nome,
                    eixo: c.eixo,
                    turma: c.turma,
                    curso: c.curso,
                    periodo: c.periodo || detectarPeriodoLegado(c.aulasRegistradas),
                    aulasRegistradas: normalizarAulas(c.aulasRegistradas),
                    cargaHorariaAnual: c.cargaHorariaAnual || 0,
                    cargaHorariaSemanal: c.cargaHorariaSemanal || 0,
                    observacoes: c.observacoes || ''
                })),
                dataColeta: r.dataColeta,
                dataColetaFormatada: new Date(r.dataColeta).toLocaleDateString('pt-BR'),
                observacoesGerais: r.observacoesGerais || '',
                totalComponentes: r.componentes?.length || 0,
                registradoPorNome: r.registradoPorNome,
                registradoEm: r.registradoEm,
                editadoPorNome: r.editadoPorNome,
                editadoEm: r.editadoEm,
                createdAt: r.createdAt
            })),
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar gestões:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET /:id
// ============================================
router.get('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const GestaoProfessor = getGestaoProfessorModel();
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        
        const registro = await GestaoProfessor.findById(id).lean();
        
        if (!registro) {
            return res.status(404).json({ success: false, error: 'Registro não encontrado' });
        }
        
        const registroNormalizado = {
            ...registro,
            componentes: (registro.componentes || []).map(c => ({
                _id: c._id,
                componenteCurricularId: c.componenteCurricularId,
                nome: c.nome,
                eixo: c.eixo,
                turma: c.turma,
                curso: c.curso,
                periodo: c.periodo || detectarPeriodoLegado(c.aulasRegistradas),
                aulasRegistradas: normalizarAulas(c.aulasRegistradas),
                cargaHorariaAnual: c.cargaHorariaAnual || 0,
                cargaHorariaSemanal: c.cargaHorariaSemanal || 0,
                observacoes: c.observacoes || ''
            }))
        };
        
        res.json({ success: true, registro: registroNormalizado });
        
    } catch (error) {
        console.error('❌ Erro ao buscar registro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PUT /:id
// ============================================
router.put('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const GestaoProfessor = getGestaoProfessorModel();
        const { id } = req.params;
        const {
            turmasVinculadas,
            componentes,
            dataColeta,
            observacoesGerais
        } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        
        const registro = await GestaoProfessor.findById(id);
        
        if (!registro) {
            return res.status(404).json({ success: false, error: 'Registro não encontrado' });
        }
        
        if (componentes !== undefined) {
            if (!Array.isArray(componentes) || componentes.length === 0) {
                return res.status(400).json({ success: false, error: 'Pelo menos um componente é obrigatório' });
            }
            
            for (let i = 0; i < componentes.length; i++) {
                const c = componentes[i];
                if (!c.nome) return res.status(400).json({ success: false, error: `Componente ${i + 1}: nome é obrigatório` });
                if (!c.turma) return res.status(400).json({ success: false, error: `Componente ${i + 1}: turma é obrigatória` });
                if (!c.periodo && !detectarPeriodoLegado(c.aulasRegistradas)) {
                    return res.status(400).json({ success: false, error: `Componente ${i + 1}: período é obrigatório` });
                }
            }
        }
        
        if (turmasVinculadas !== undefined) {
            registro.turmasVinculadas = turmasVinculadas.map(t => ({
                turma: sanitizarString(t.turma),
                curso: sanitizarString(t.curso)
            }));
        }
        
        if (componentes !== undefined) {
            registro.componentes = componentes.map(normalizarComponentePayload);
        }
        
        if (dataColeta) {
            registro.dataColeta = new Date(dataColeta + 'T12:00:00');
        }
        
        if (observacoesGerais !== undefined) {
            registro.observacoesGerais = sanitizarString(observacoesGerais);
        }
        
        registro.editadoPor = req.userId;
        registro.editadoPorNome = req.userNome;
        registro.editadoEm = new Date();
        
        await registro.save();
        
        console.log(`✅ Gestão atualizada: ${registro._id}`);
        
        res.json({
            success: true,
            message: 'Registro atualizado com sucesso!',
            registro
        });
        
    } catch (error) {
        console.error('❌ Erro ao editar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DELETE /:id
// ============================================
router.delete('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const GestaoProfessor = getGestaoProfessorModel();
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        
        const registro = await GestaoProfessor.findByIdAndDelete(id);
        
        if (!registro) {
            return res.status(404).json({ success: false, error: 'Registro não encontrado' });
        }
        
        console.log(`🗑️ Gestão excluída: ${id}`);
        
        res.json({ success: true, message: 'Registro excluído com sucesso!' });
        
    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET /dashboard/resumo
// ============================================
router.get('/dashboard/resumo', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const GestaoProfessor = getGestaoProfessorModel();
        const { mes } = req.query;
        
        let filtro = { ativo: true };
        let filtroMes = { ativo: true };
        
        if (mes) {
            const [ano, mesNum] = mes.split('-').map(Number);
            const inicioMes = new Date(ano, mesNum - 1, 1);
            const fimMes = new Date(ano, mesNum, 0, 23, 59, 59);
            filtroMes.dataColeta = { $gte: inicioMes, $lte: fimMes };
        }
        
        const [
            totalGeral,
            totalMes,
            porEixo,
            porTurma,
            ultimosRegistros,
            professoresUnicos
        ] = await Promise.all([
            GestaoProfessor.countDocuments(filtro),
            GestaoProfessor.countDocuments(filtroMes),
            
            GestaoProfessor.aggregate([
                { $match: filtro },
                { $unwind: '$componentes' },
                { $group: { _id: '$componentes.eixo', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            
            GestaoProfessor.aggregate([
                { $match: filtro },
                { $unwind: '$componentes' },
                { $group: { _id: '$componentes.turma', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 15 }
            ]),
            
            GestaoProfessor.find(filtro)
                .sort({ createdAt: -1 })
                .limit(10)
                .select('professorNome professorEixo dataColeta componentes')
                .lean(),
            
            GestaoProfessor.distinct('professorId', filtro)
        ]);
        
        const topProfessores = await GestaoProfessor.aggregate([
            { $match: filtro },
            { 
                $group: { 
                    _id: '$professorId', 
                    nome: { $first: '$professorNome' },
                    eixo: { $first: '$professorEixo' },
                    totalComponentes: { $sum: { $size: '$componentes' } },
                    totalRegistros: { $sum: 1 }
                } 
            },
            { $sort: { totalComponentes: -1 } },
            { $limit: 10 }
        ]);
        
        const aulasAgregadas = await GestaoProfessor.aggregate([
            { $match: filtro },
            { $unwind: '$componentes' },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $cond: [
                                { $eq: [{ $type: '$componentes.aulasRegistradas' }, 'object'] },
                                {
                                    $add: [
                                        { $ifNull: ['$componentes.aulasRegistradas.periodo1', 0] },
                                        { $ifNull: ['$componentes.aulasRegistradas.periodo2', 0] },
                                        { $ifNull: ['$componentes.aulasRegistradas.periodo3', 0] },
                                        { $ifNull: ['$componentes.aulasRegistradas.periodo4', 0] }
                                    ]
                                },
                                { $ifNull: ['$componentes.aulasRegistradas', 0] }
                            ]
                        }
                    }
                }
            }
        ]);
        const totalAulas = aulasAgregadas.length > 0 ? aulasAgregadas[0].total : 0;
        
        const porPeriodo = await GestaoProfessor.aggregate([
            { $match: filtro },
            { $unwind: '$componentes' },
            {
                $addFields: {
                    _periodoEfetivo: {
                        $cond: [
                            { $and: [{ $ne: ['$componentes.periodo', null] }, { $ne: ['$componentes.periodo', ''] }] },
                            '$componentes.periodo',
                            {
                                $switch: {
                                    branches: [
                                        { case: { $gt: [{ $ifNull: ['$componentes.aulasRegistradas.periodo1', 0] }, 0] }, then: '1' },
                                        { case: { $gt: [{ $ifNull: ['$componentes.aulasRegistradas.periodo2', 0] }, 0] }, then: '2' },
                                        { case: { $gt: [{ $ifNull: ['$componentes.aulasRegistradas.periodo3', 0] }, 0] }, then: '3' },
                                        { case: { $gt: [{ $ifNull: ['$componentes.aulasRegistradas.periodo4', 0] }, 0] }, then: '4' }
                                    ],
                                    default: null
                                }
                            }
                        ]
                    },
                    _aulasEfetivas: {
                        $cond: [
                            { $eq: [{ $type: '$componentes.aulasRegistradas' }, 'object'] },
                            {
                                $add: [
                                    { $ifNull: ['$componentes.aulasRegistradas.periodo1', 0] },
                                    { $ifNull: ['$componentes.aulasRegistradas.periodo2', 0] },
                                    { $ifNull: ['$componentes.aulasRegistradas.periodo3', 0] },
                                    { $ifNull: ['$componentes.aulasRegistradas.periodo4', 0] }
                                ]
                            },
                            { $ifNull: ['$componentes.aulasRegistradas', 0] }
                        ]
                    }
                }
            },
            { $match: { _periodoEfetivo: { $ne: null } } },
            {
                $group: {
                    _id: '$_periodoEfetivo',
                    totalAulas: { $sum: '$_aulasEfetivas' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            resumo: {
                totalGeral,
                totalMes,
                totalProfessores: professoresUnicos.length,
                totalAulasRegistradas: totalAulas
            },
            porEixo: porEixo.map(e => ({
                eixo: e._id || 'Sem Eixo',
                count: e.count
            })),
            porTurma: porTurma.map(t => ({
                turma: t._id || 'Sem Turma',
                count: t.count
            })),
            porPeriodo: porPeriodo.map(p => ({
                periodo: p._id,
                totalAulas: p.totalAulas,
                count: p.count
            })),
            topProfessores: topProfessores.map(p => ({
                id: p._id,
                nome: p.nome,
                eixo: p.eixo,
                totalComponentes: p.totalComponentes,
                totalRegistros: p.totalRegistros
            })),
            ultimosRegistros: ultimosRegistros.map(r => ({
                id: r._id,
                professorNome: r.professorNome,
                professorEixo: r.professorEixo,
                dataColeta: r.dataColeta,
                dataColetaFormatada: new Date(r.dataColeta).toLocaleDateString('pt-BR'),
                totalComponentes: r.componentes?.length || 0
            }))
        });
        
    } catch (error) {
        console.error('❌ Erro no dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET /relatorio/gerar - ⚠️ VERSÃO CORRIGIDA (relatórios por tipo)
// ============================================
router.get('/relatorio/gerar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const GestaoProfessor = getGestaoProfessorModel();
        const { 
            tipo = 'geral',
            eixo, 
            turma, 
            periodo,
            professorId,
            dataInicio, 
            dataFim 
        } = req.query;
        
        let filtro = { ativo: true };
        
        if (dataInicio || dataFim) {
            filtro.dataColeta = {};
            if (dataInicio) filtro.dataColeta.$gte = new Date(dataInicio + 'T00:00:00');
            if (dataFim) filtro.dataColeta.$lte = new Date(dataFim + 'T23:59:59');
        }
        
        // Filtros opcionais
        if (eixo) filtro['componentes.eixo'] = eixo;
        if (turma) filtro['componentes.turma'] = turma;
        if (periodo) filtro['componentes.periodo'] = String(periodo);
        if (professorId) filtro.professorId = professorId;
        
        const registros = await GestaoProfessor.find(filtro).sort({ dataColeta: -1 }).lean();
        
        // ============================================
        // CONTADORES GERAIS
        // ============================================
        let totalComponentes = 0;
        let totalAulas = 0;
        
        registros.forEach(r => {
            (r.componentes || []).forEach(c => {
                totalComponentes++;
                totalAulas += normalizarAulas(c.aulasRegistradas);
            });
        });
        
        // ============================================
        // TIPO: PROFESSOR (agrupado por professor)
        // ============================================
        if (tipo === 'professor') {
            const professoresMap = {};
            
            registros.forEach(r => {
                const key = String(r.professorId);
                
                if (!professoresMap[key]) {
                    professoresMap[key] = {
                        professorId: r.professorId,
                        professorNome: r.professorNome || 'Sem nome',
                        professorEmail: r.professorEmail || '',
                        professorMatricula: r.professorMatricula || '',
                        professorEixo: r.professorEixo || '',
                        totalRegistros: 0,
                        totalComponentes: 0,
                        totalAulas: 0,
                        turmasSet: new Set(),
                        componentesSet: new Set(),
                        periodosSet: new Set(),
                        datasColeta: []
                    };
                }
                
                const prof = professoresMap[key];
                prof.totalRegistros++;
                
                if (r.dataColeta) {
                    prof.datasColeta.push(r.dataColeta);
                }
                
                (r.componentes || []).forEach(c => {
                    prof.totalComponentes++;
                    prof.totalAulas += normalizarAulas(c.aulasRegistradas);
                    
                    if (c.turma) prof.turmasSet.add(c.turma);
                    if (c.nome) prof.componentesSet.add(c.nome);
                    
                    const p = c.periodo || detectarPeriodoLegado(c.aulasRegistradas);
                    if (p) prof.periodosSet.add(p);
                });
            });
            
            const professores = Object.values(professoresMap).map(p => ({
                professorId: p.professorId,
                professorNome: p.professorNome,
                professorEmail: p.professorEmail,
                professorMatricula: p.professorMatricula,
                professorEixo: p.professorEixo,
                totalRegistros: p.totalRegistros,
                totalComponentes: p.totalComponentes,
                totalAulas: p.totalAulas,
                totalTurmas: p.turmasSet.size,
                totalComponentesUnicos: p.componentesSet.size,
                totalPeriodos: p.periodosSet.size,
                turmas: Array.from(p.turmasSet).sort(),
                componentes: Array.from(p.componentesSet).sort(),
                periodos: Array.from(p.periodosSet).sort()
            })).sort((a, b) => a.professorNome.localeCompare(b.professorNome));
            
            return res.json({
                success: true,
                tipo: 'professor',
                filtros: { eixo, turma, periodo, professorId, dataInicio, dataFim },
                total: professores.length,
                totalRegistros: registros.length,
                totalComponentes,
                totalAulas,
                professores,
                // Compatibilidade: registros completos
                registros: registros.map(r => ({
                    id: r._id,
                    professorId: r.professorId,
                    professorNome: r.professorNome,
                    professorEixo: r.professorEixo,
                    dataColeta: r.dataColeta,
                    dataColetaFormatada: new Date(r.dataColeta).toLocaleDateString('pt-BR'),
                    componentes: (r.componentes || []).map(c => ({
                        ...c,
                        periodo: c.periodo || detectarPeriodoLegado(c.aulasRegistradas),
                        aulasRegistradas: normalizarAulas(c.aulasRegistradas)
                    }))
                }))
            });
        }
        
        // ============================================
        // TIPO: TURMA (agrupado por turma)
        // ============================================
        if (tipo === 'turma') {
            const turmasMap = {};
            
            registros.forEach(r => {
                (r.componentes || []).forEach(c => {
                    const turmaKey = c.turma || 'Sem Turma';
                    
                    if (!turmasMap[turmaKey]) {
                        turmasMap[turmaKey] = {
                            turma: turmaKey,
                            curso: c.curso || 'Não informado',
                            totalRegistros: 0,
                            totalComponentes: 0,
                            totalAulas: 0,
                            professoresSet: new Set(),
                            componentesSet: new Set(),
                            periodosSet: new Set()
                        };
                    }
                    
                    const t = turmasMap[turmaKey];
                    t.totalRegistros++;
                    t.totalComponentes++;
                    t.totalAulas += normalizarAulas(c.aulasRegistradas);
                    
                    if (r.professorNome) t.professoresSet.add(r.professorNome);
                    if (c.nome) t.componentesSet.add(c.nome);
                    
                    const p = c.periodo || detectarPeriodoLegado(c.aulasRegistradas);
                    if (p) t.periodosSet.add(p);
                });
            });
            
            const turmas = Object.values(turmasMap).map(t => ({
                turma: t.turma,
                curso: t.curso,
                totalRegistros: t.totalRegistros,
                totalComponentes: t.totalComponentes,
                totalAulas: t.totalAulas,
                totalProfessores: t.professoresSet.size,
                totalComponentesUnicos: t.componentesSet.size,
                totalPeriodos: t.periodosSet.size,
                professores: Array.from(t.professoresSet).sort(),
                componentes: Array.from(t.componentesSet).sort(),
                periodos: Array.from(t.periodosSet).sort()
            })).sort((a, b) => a.turma.localeCompare(b.turma));
            
            return res.json({
                success: true,
                tipo: 'turma',
                filtros: { eixo, turma, periodo, professorId, dataInicio, dataFim },
                total: turmas.length,
                totalRegistros: registros.length,
                totalComponentes,
                totalAulas,
                turmas,
                registros: registros.map(r => ({
                    id: r._id,
                    professorId: r.professorId,
                    professorNome: r.professorNome,
                    professorEixo: r.professorEixo,
                    dataColeta: r.dataColeta,
                    dataColetaFormatada: new Date(r.dataColeta).toLocaleDateString('pt-BR'),
                    componentes: (r.componentes || []).map(c => ({
                        ...c,
                        periodo: c.periodo || detectarPeriodoLegado(c.aulasRegistradas),
                        aulasRegistradas: normalizarAulas(c.aulasRegistradas)
                    }))
                }))
            });
        }
        
        // ============================================
        // TIPO: EIXO (agrupado por eixo, com nomes de componentes)
        // ============================================
        if (tipo === 'eixo') {
            const eixosMap = {};
            
            registros.forEach(r => {
                (r.componentes || []).forEach(c => {
                    const eixoKey = c.eixo || 'Sem Eixo';
                    
                    if (!eixosMap[eixoKey]) {
                        eixosMap[eixoKey] = {
                            eixo: eixoKey,
                            totalRegistros: 0,
                            totalComponentes: 0,
                            totalAulas: 0,
                            professoresSet: new Set(),
                            turmasSet: new Set(),
                            componentesMap: new Map() // nome → { nome, count, aulas }
                        };
                    }
                    
                    const e = eixosMap[eixoKey];
                    e.totalRegistros++;
                    e.totalComponentes++;
                    
                    const aulas = normalizarAulas(c.aulasRegistradas);
                    e.totalAulas += aulas;
                    
                    if (r.professorNome) e.professoresSet.add(r.professorNome);
                    if (c.turma) e.turmasSet.add(c.turma);
                    
                    if (c.nome) {
                        const atual = e.componentesMap.get(c.nome) || { nome: c.nome, count: 0, aulas: 0 };
                        atual.count++;
                        atual.aulas += aulas;
                        e.componentesMap.set(c.nome, atual);
                    }
                });
            });
            
            const eixos = Object.values(eixosMap).map(e => ({
                eixo: e.eixo,
                totalRegistros: e.totalRegistros,
                totalComponentes: e.totalComponentes,
                totalAulas: e.totalAulas,
                totalProfessores: e.professoresSet.size,
                totalTurmas: e.turmasSet.size,
                totalComponentesUnicos: e.componentesMap.size,
                professores: Array.from(e.professoresSet).sort(),
                turmas: Array.from(e.turmasSet).sort(),
                componentes: Array.from(e.componentesMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))
            })).sort((a, b) => a.eixo.localeCompare(b.eixo));
            
            return res.json({
                success: true,
                tipo: 'eixo',
                filtros: { eixo, turma, periodo, professorId, dataInicio, dataFim },
                total: eixos.length,
                totalRegistros: registros.length,
                totalComponentes,
                totalAulas,
                eixos,
                registros: registros.map(r => ({
                    id: r._id,
                    professorId: r.professorId,
                    professorNome: r.professorNome,
                    professorEixo: r.professorEixo,
                    dataColeta: r.dataColeta,
                    dataColetaFormatada: new Date(r.dataColeta).toLocaleDateString('pt-BR'),
                    componentes: (r.componentes || []).map(c => ({
                        ...c,
                        periodo: c.periodo || detectarPeriodoLegado(c.aulasRegistradas),
                        aulasRegistradas: normalizarAulas(c.aulasRegistradas)
                    }))
                }))
            });
        }
        
        // ============================================
        // TIPO: GERAL (padrão)
        // ============================================
        const porEixo = {};
        const porTurma = {};
        const porProfessor = {};
        const porComponente = {};
        const porPeriodo = {};
        
        registros.forEach(r => {
            (r.componentes || []).forEach(c => {
                const eixoKey = c.eixo || 'Sem Eixo';
                porEixo[eixoKey] = (porEixo[eixoKey] || 0) + 1;
                
                const turmaKey = c.turma || 'Sem Turma';
                porTurma[turmaKey] = (porTurma[turmaKey] || 0) + 1;
                
                const profKey = r.professorNome;
                porProfessor[profKey] = (porProfessor[profKey] || 0) + 1;
                
                const compKey = c.nome || 'Sem Nome';
                porComponente[compKey] = (porComponente[compKey] || 0) + 1;
                
                const aulas = normalizarAulas(c.aulasRegistradas);
                const periodoKey = c.periodo || detectarPeriodoLegado(c.aulasRegistradas) || 'sem_periodo';
                if (!porPeriodo[periodoKey]) porPeriodo[periodoKey] = 0;
                porPeriodo[periodoKey] += aulas;
            });
        });
        
        res.json({
            success: true,
            tipo: 'geral',
            filtros: { eixo, turma, periodo, professorId, dataInicio, dataFim },
            total: registros.length,
            totalComponentes,
            totalAulas,
            estatisticas: {
                porEixo,
                porTurma,
                porProfessor,
                porComponente,
                porPeriodo
            },
            registros: registros.map(r => ({
                id: r._id,
                professorId: r.professorId,
                professorNome: r.professorNome,
                professorEixo: r.professorEixo,
                professorMatricula: r.professorMatricula,
                dataColeta: r.dataColeta,
                dataColetaFormatada: new Date(r.dataColeta).toLocaleDateString('pt-BR'),
                componentes: (r.componentes || []).map(c => ({
                    ...c,
                    periodo: c.periodo || detectarPeriodoLegado(c.aulasRegistradas),
                    aulasRegistradas: normalizarAulas(c.aulasRegistradas)
                })),
                turmasVinculadas: r.turmasVinculadas || [],
                observacoesGerais: r.observacoesGerais || '',
                registradoPorNome: r.registradoPorNome
            }))
        });
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;