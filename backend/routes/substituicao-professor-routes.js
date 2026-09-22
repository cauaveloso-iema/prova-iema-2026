// backend/routes/substituicao-professor-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

function getSubstituicaoModel() { return require('../models/SubstituicaoProfessor'); }
function getPermissaoModulo() { return require('../models/PermissaoModulo'); }
function getUserModel() { return require('../models/User'); }

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
        
        const PermissaoModulo = getPermissaoModulo();
        const permissao = await PermissaoModulo.findOne({ 
            modulo: 'substituicao_professores_setor_pedagogico',
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
// ROTAS
// ============================================

router.get('/verificar-permissao', authenticateToken, async (req, res) => {
    try {
        if (req.userRole === 'admin' || req.userRole === 'super_admin') {
            return res.json({ success: true, temPermissao: true, motivo: 'Admin' });
        }
        
        const PermissaoModulo = getPermissaoModulo();
        const permissao = await PermissaoModulo.findOne({ 
            modulo: 'substituicao_professores_setor_pedagogico', ativo: true 
        });
        
        if (!permissao) return res.json({ success: true, temPermissao: false, motivo: 'Não configurado' });
        
        const emailNorm = (req.userEmail || '').trim().toLowerCase();
        const emails = permissao.emailsAutorizados.map(e => (e || '').trim().toLowerCase());
        
        res.json({ success: true, temPermissao: emails.includes(emailNorm), email: req.userEmail });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/professores', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const { busca } = req.query;
        
        let filtro = { role: 'professor', ativo: true };
        if (busca) {
            filtro.$or = [
                { nome: { $regex: busca, $options: 'i' } },
                { email: { $regex: busca, $options: 'i' } },
                { matricula: { $regex: busca, $options: 'i' } }
            ];
        }
        
        const professores = await User.find(filtro)
            .select('_id nome email telefone eixo matricula')
            .sort({ nome: 1 })
            .lean();
        
        res.json({
            success: true,
            professores: professores.map(p => ({
                id: p._id, nome: p.nome, email: p.email,
                telefone: p.telefone || 'Não informado',
                eixo: p.eixo || 'Não definido',
                matricula: p.matricula || ''
            })),
            total: professores.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/turmas', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const turmas = await User.distinct('turma', {
            role: 'aluno', ativo: true,
            turma: { $ne: null, $exists: true, $ne: '' }
        });
        
        const turmasValidas = turmas.filter(t => t && t.trim() !== '')
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        
        res.json({ success: true, turmas: turmasValidas, total: turmasValidas.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Registrar substituição (COM SUBSTITUTO AUSENTE)
router.post('/registrar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const User = getUserModel();
        
        const { 
            professorAusenteId, professorSubstitutoId, turma, horario, data, 
            motivo, motivoDetalhes, observacoes,
            substitutoAusente, substitutoAusenteMotivo, substitutoAusenteObservacoes
        } = req.body;
        
        if (!professorAusenteId || !professorSubstitutoId) return res.status(400).json({ success: false, error: 'Selecione os professores' });
        if (!turma) return res.status(400).json({ success: false, error: 'Selecione a turma' });
        if (!horario || horario < 1 || horario > 9) return res.status(400).json({ success: false, error: 'Horário inválido' });
        if (!data) return res.status(400).json({ success: false, error: 'Informe a data' });
        if (!motivo) return res.status(400).json({ success: false, error: 'Selecione o motivo' });
        if (professorAusenteId === professorSubstitutoId) return res.status(400).json({ success: false, error: 'Professores devem ser diferentes' });
        
        if (substitutoAusente && !substitutoAusenteMotivo) {
            return res.status(400).json({ success: false, error: 'Informe o motivo da ausência do substituto' });
        }
        
        const [profAusente, profSubstituto] = await Promise.all([
            User.findById(professorAusenteId).select('nome email telefone eixo').lean(),
            User.findById(professorSubstitutoId).select('nome email telefone eixo').lean()
        ]);
        
        if (!profAusente || !profSubstituto) return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        
        const dataObj = new Date(data + 'T12:00:00');
        const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const diaSemana = diasSemana[dataObj.getDay()];
        const mesReferencia = data.substring(0, 7);
        
        const novaSubstituicao = new Substituicao({
            professorAusenteId: profAusente._id,
            professorAusenteNome: profAusente.nome,
            professorAusenteEmail: profAusente.email || '',
            professorAusenteTelefone: profAusente.telefone || '',
            professorAusenteEixo: profAusente.eixo || '',
            professorSubstitutoId: profSubstituto._id,
            professorSubstitutoNome: profSubstituto.nome,
            professorSubstitutoEmail: profSubstituto.email || '',
            professorSubstitutoTelefone: profSubstituto.telefone || '',
            professorSubstitutoEixo: profSubstituto.eixo || '',
            turma, horario: parseInt(horario), data, diaSemana,
            motivo, motivoDetalhes: motivoDetalhes || '', observacoes: observacoes || '',
            substitutoAusente: substitutoAusente || false,
            substitutoAusenteMotivo: substitutoAusente ? (substitutoAusenteMotivo || '') : '',
            substitutoAusenteObservacoes: substitutoAusente ? (substitutoAusenteObservacoes || '') : '',
            mesReferencia,
            registradoPor: req.userId,
            registradoPorNome: req.userNome,
            registradoPorEmail: req.userEmail
        });
        
        await novaSubstituicao.save();
        
        res.json({ success: true, message: 'Substituição registrada', substituicao: novaSubstituicao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Listar substituições
router.get('/listar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const { mes, turma, motivo, busca, substitutoAusente, limit = 100, page = 1 } = req.query;
        
        let filtro = { ativo: true };
        if (mes) filtro.mesReferencia = mes;
        if (turma) filtro.turma = turma;
        if (motivo) filtro.motivo = motivo;
        if (substitutoAusente !== undefined && substitutoAusente !== '') {
            filtro.substitutoAusente = substitutoAusente === 'true';
        }
        if (busca) {
            const regex = { $regex: busca, $options: 'i' };
            filtro.$or = [
                { professorAusenteNome: regex },
                { professorSubstitutoNome: regex },
                { turma: regex }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [substituicoes, total] = await Promise.all([
            Substituicao.find(filtro).sort({ data: -1, horario: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Substituicao.countDocuments(filtro)
        ]);
        
        res.json({
            success: true,
            substituicoes: substituicoes.map(s => ({
                id: s._id,
                professorAusente: { id: s.professorAusenteId, nome: s.professorAusenteNome, email: s.professorAusenteEmail, telefone: s.professorAusenteTelefone, eixo: s.professorAusenteEixo },
                professorSubstituto: { id: s.professorSubstitutoId, nome: s.professorSubstitutoNome, email: s.professorSubstitutoEmail, telefone: s.professorSubstitutoTelefone, eixo: s.professorSubstitutoEixo },
                turma: s.turma, horario: s.horario, data: s.data,
                dataFormatada: new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                diaSemana: s.diaSemana, motivo: s.motivo, motivoDetalhes: s.motivoDetalhes,
                observacoes: s.observacoes, mesReferencia: s.mesReferencia,
                substitutoAusente: s.substitutoAusente || false,
                substitutoAusenteMotivo: s.substitutoAusenteMotivo || '',
                substitutoAusenteObservacoes: s.substitutoAusenteObservacoes || '',
                registradoPor: s.registradoPorNome, registradoEm: s.registradoEm,
                editadoPorNome: s.editadoPorNome, editadoEm: s.editadoEm
            })),
            total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const substituicao = await Substituicao.findById(req.params.id).lean();
        if (!substituicao) return res.status(404).json({ success: false, error: 'Não encontrada' });
        res.json({ success: true, substituicao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Editar
router.put('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const { 
            turma, horario, data, motivo, motivoDetalhes, observacoes,
            substitutoAusente, substitutoAusenteMotivo, substitutoAusenteObservacoes
        } = req.body;
        
        const substituicao = await Substituicao.findById(req.params.id);
        if (!substituicao) return res.status(404).json({ success: false, error: 'Não encontrada' });
        
        if (turma) substituicao.turma = turma;
        if (horario) substituicao.horario = parseInt(horario);
        if (data) {
            substituicao.data = data;
            substituicao.mesReferencia = data.substring(0, 7);
            const dataObj = new Date(data + 'T12:00:00');
            const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
            substituicao.diaSemana = dias[dataObj.getDay()];
        }
        if (motivo) substituicao.motivo = motivo;
        if (motivoDetalhes !== undefined) substituicao.motivoDetalhes = motivoDetalhes;
        if (observacoes !== undefined) substituicao.observacoes = observacoes;
        
        if (substitutoAusente !== undefined) {
            substituicao.substitutoAusente = substitutoAusente;
            if (substitutoAusente) {
                substituicao.substitutoAusenteMotivo = substitutoAusenteMotivo || '';
                substituicao.substitutoAusenteObservacoes = substitutoAusenteObservacoes || '';
            } else {
                substituicao.substitutoAusenteMotivo = '';
                substituicao.substitutoAusenteObservacoes = '';
            }
        }
        
        substituicao.editadoPor = req.userId;
        substituicao.editadoPorNome = req.userNome;
        substituicao.editadoEm = new Date();
        
        await substituicao.save();
        res.json({ success: true, message: 'Atualizada', substituicao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        await Substituicao.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Excluída' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dashboard
router.get('/dashboard/resumo', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const mes = req.query.mes || new Date().toISOString().substring(0, 7);
        const filtro = { mesReferencia: mes, ativo: true };
        
        const [
            totalMes, porMotivo, porProfessorAusente, porProfessorSubstituto, 
            porTurma, porHorario, ultimas, substituicoesPorDia, totalSubstitutosAusentes
        ] = await Promise.all([
            Substituicao.countDocuments(filtro),
            Substituicao.aggregate([{ $match: filtro }, { $group: { _id: '$motivo', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
            Substituicao.aggregate([{ $match: filtro }, { $group: { _id: '$professorAusenteId', nome: { $first: '$professorAusenteNome' }, eixo: { $first: '$professorAusenteEixo' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
            Substituicao.aggregate([{ $match: filtro }, { $group: { _id: '$professorSubstitutoId', nome: { $first: '$professorSubstitutoNome' }, eixo: { $first: '$professorSubstitutoEixo' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
            Substituicao.aggregate([{ $match: filtro }, { $group: { _id: '$turma', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
            Substituicao.aggregate([{ $match: filtro }, { $group: { _id: '$horario', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
            Substituicao.find(filtro).sort({ createdAt: -1 }).limit(10).lean(),
            Substituicao.aggregate([{ $match: filtro }, { $group: { _id: '$data', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
            Substituicao.countDocuments({ ...filtro, substitutoAusente: true })
        ]);
        
        const motivosLabels = {
            'falta_professor': 'Falta do Professor', 'licenca_medica': 'Licença Médica',
            'licenca_maternidade_paternidade': 'Licença Mat/Pater', 'capacitacao_formacao': 'Capacitação',
            'reuniao_externa': 'Reunião Externa', 'problema_pessoal': 'Problema Pessoal',
            'atestado': 'Atestado', 'outros': 'Outros'
        };
        
        res.json({
            success: true, mesReferencia: mes,
            resumo: {
                totalMes,
                mediaDiaria: substituicoesPorDia.length > 0 ? (totalMes / substituicoesPorDia.length).toFixed(1) : 0,
                totalSubstitutosAusentes
            },
            porMotivo: porMotivo.map(m => ({ motivo: m._id, label: motivosLabels[m._id] || m._id, count: m.count })),
            professoresMaisAusentes: porProfessorAusente.map(p => ({ id: p._id, nome: p.nome, eixo: p.eixo, count: p.count })),
            professoresMaisSubstituiram: porProfessorSubstituto.map(p => ({ id: p._id, nome: p.nome, eixo: p.eixo, count: p.count })),
            porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
            porHorario: porHorario.map(h => ({ horario: h._id, count: h.count })),
            substituicoesPorDia: substituicoesPorDia.map(d => ({ data: d._id, count: d.count })),
            ultimasSubstituicoes: ultimas.map(s => ({
                id: s._id, professorAusenteNome: s.professorAusenteNome,
                professorSubstitutoNome: s.professorSubstitutoNome,
                turma: s.turma, horario: s.horario, data: s.data, motivo: s.motivo, registradoEm: s.registradoEm
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Relatório
router.get('/relatorio/gerar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const { mes, dataInicio, dataFim, turma, motivo, substitutoAusente } = req.query;
        
        let filtro = { ativo: true };
        if (mes) filtro.mesReferencia = mes;
        if (dataInicio || dataFim) {
            filtro.data = {};
            if (dataInicio) filtro.data.$gte = dataInicio;
            if (dataFim) filtro.data.$lte = dataFim;
        }
        if (turma) filtro.turma = turma;
        if (motivo) filtro.motivo = motivo;
        if (substitutoAusente !== undefined && substitutoAusente !== '') {
            filtro.substitutoAusente = substitutoAusente === 'true';
        }
        
        const substituicoes = await Substituicao.find(filtro).sort({ data: -1, horario: 1 }).lean();
        
        const motivosLabels = {
            'falta_professor': 'Falta do Professor', 'licenca_medica': 'Licença Médica',
            'licenca_maternidade_paternidade': 'Licença Mat/Pater', 'capacitacao_formacao': 'Capacitação',
            'reuniao_externa': 'Reunião Externa', 'problema_pessoal': 'Problema Pessoal',
            'atestado': 'Atestado', 'outros': 'Outros'
        };
        
        const porMotivo = {}, porTurma = {}, porProfessor = {};
        substituicoes.forEach(s => {
            porMotivo[motivosLabels[s.motivo] || s.motivo] = (porMotivo[motivosLabels[s.motivo] || s.motivo] || 0) + 1;
            porTurma[s.turma] = (porTurma[s.turma] || 0) + 1;
            porProfessor[s.professorAusenteNome] = (porProfessor[s.professorAusenteNome] || 0) + 1;
        });
        
        res.json({
            success: true, total: substituicoes.length,
            estatisticas: { porMotivo, porTurma, porProfessor },
            substituicoes: substituicoes.map(s => ({
                id: s._id,
                professorAusenteNome: s.professorAusenteNome,
                professorSubstitutoNome: s.professorSubstitutoNome,
                turma: s.turma, horario: s.horario, data: s.data,
                dataFormatada: new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                diaSemana: s.diaSemana, motivo: s.motivo,
                motivoLabel: motivosLabels[s.motivo] || s.motivo,
                motivoDetalhes: s.motivoDetalhes, observacoes: s.observacoes,
                substitutoAusente: s.substitutoAusente || false,
                substitutoAusenteMotivo: s.substitutoAusenteMotivo || '',
                substitutoAusenteObservacoes: s.substitutoAusenteObservacoes || '',
                registradoPor: s.registradoPorNome, registradoEm: s.registradoEm
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;