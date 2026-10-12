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
// HELPERS
// ============================================
function normalizarHorarios(horarios, horario) {
    let lista = [];
    if (Array.isArray(horarios) && horarios.length > 0) {
        lista = horarios.map(h => parseInt(h)).filter(h => h >= 1 && h <= 9);
    } else if (horario) {
        lista = [parseInt(horario)];
    }
    return [...new Set(lista)].sort((a, b) => a - b);
}

function getHorariosDe(s) {
    if (s.horarios && s.horarios.length > 0) return s.horarios;
    if (s.horario) return [s.horario];
    return [];
}

// Validar CPF (dígitos verificadores)
function validarCPF(cpf) {
    if (!cpf) return false;
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    if (cpfLimpo.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false;
    
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(9))) return false;
    
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(10))) return false;
    
    return true;
}

// Validar email institucional
function validarEmailInstitucional(email) {
    if (!email) return false;
    return email.toLowerCase().endsWith('@iemasaoluiscentro.net');
}

// ============================================
// ROTAS EXISTENTES
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

// ============================================
// REGISTRAR (com suporte a "sem substituto" + múltiplos horários)
// ============================================
router.post('/registrar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const User = getUserModel();
        
        const { 
            professorAusenteId, professorSubstitutoId, turma, data, 
            horarios, horario,
            motivo, motivoDetalhes, observacoes,
            substitutoAusente, substitutoAusenteMotivo, substitutoAusenteObservacoes
        } = req.body;
        
        const semSubstituto = substitutoAusente === true;
        const listaHorarios = normalizarHorarios(horarios, horario);
        
        // ============ VALIDAÇÕES ============
        if (!professorAusenteId) {
            return res.status(400).json({ success: false, error: 'Selecione o professor ausente' });
        }
        
        if (!semSubstituto && !professorSubstitutoId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Selecione o professor substituto ou marque "Não há substituto disponível"' 
            });
        }
        
        if (!turma) return res.status(400).json({ success: false, error: 'Selecione a turma' });
        if (listaHorarios.length === 0) {
            return res.status(400).json({ success: false, error: 'Selecione pelo menos um horário' });
        }
        if (!data) return res.status(400).json({ success: false, error: 'Informe a data' });
        
        if (!semSubstituto) {
            if (!motivo) return res.status(400).json({ success: false, error: 'Selecione o motivo' });
            if (motivo === 'outros' && !motivoDetalhes) {
                return res.status(400).json({ success: false, error: 'Especifique o motivo' });
            }
        }
        
        if (semSubstituto && !substitutoAusenteMotivo) {
            return res.status(400).json({ success: false, error: 'Informe o motivo da ausência do substituto' });
        }
        
        if (!semSubstituto && professorAusenteId === professorSubstitutoId) {
            return res.status(400).json({ success: false, error: 'Professores devem ser diferentes' });
        }
        
        // ============ BUSCAR PROFESSORES ============
        const profAusente = await User.findById(professorAusenteId)
            .select('nome email telefone eixo').lean();
        
        if (!profAusente) {
            return res.status(404).json({ success: false, error: 'Professor ausente não encontrado' });
        }
        
        let profSubstituto = null;
        if (!semSubstituto) {
            profSubstituto = await User.findById(professorSubstitutoId)
                .select('nome email telefone eixo').lean();
            
            if (!profSubstituto) {
                return res.status(404).json({ success: false, error: 'Professor substituto não encontrado' });
            }
        }
        
        // ============ MONTAR DADOS ============
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
            
            professorSubstitutoId: profSubstituto ? profSubstituto._id : null,
            professorSubstitutoNome: profSubstituto ? profSubstituto.nome : 'SEM SUBSTITUTO',
            professorSubstitutoEmail: profSubstituto ? (profSubstituto.email || '') : '',
            professorSubstitutoTelefone: profSubstituto ? (profSubstituto.telefone || '') : '',
            professorSubstitutoEixo: profSubstituto ? (profSubstituto.eixo || '') : '',
            
            turma,
            horarios: listaHorarios,
            horario: listaHorarios[0],
            data,
            diaSemana,
            
            motivo: semSubstituto ? 'sem_substituto' : motivo,
            motivoDetalhes: semSubstituto ? '' : (motivoDetalhes || ''),
            observacoes: observacoes || '',
            
            substitutoAusente: semSubstituto,
            substitutoAusenteMotivo: semSubstituto ? (substitutoAusenteMotivo || '') : '',
            substitutoAusenteObservacoes: semSubstituto ? (substitutoAusenteObservacoes || '') : '',
            
            mesReferencia,
            registradoPor: req.userId,
            registradoPorNome: req.userNome,
            registradoPorEmail: req.userEmail
        });
        
        await novaSubstituicao.save();
        
        res.json({ 
            success: true, 
            message: semSubstituto 
                ? 'Substituição registrada (sem substituto disponível)' 
                : 'Substituição registrada', 
            substituicao: novaSubstituicao 
        });
    } catch (error) {
        console.error('❌ Erro ao registrar substituição:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// LISTAR
// ============================================
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
                turma: s.turma,
                horarios: getHorariosDe(s),
                horario: s.horario,
                data: s.data,
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

// ============================================
// BUSCAR POR ID
// ============================================
router.get('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const substituicao = await Substituicao.findById(req.params.id).lean();
        if (!substituicao) return res.status(404).json({ success: false, error: 'Não encontrada' });
        
        // Garantir que horarios sempre esteja presente
        substituicao.horarios = getHorariosDe(substituicao);
        
        res.json({ success: true, substituicao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// EDITAR
// ============================================
router.put('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        const { 
            turma, horarios, horario, data, motivo, motivoDetalhes, observacoes,
            substitutoAusente, substitutoAusenteMotivo, substitutoAusenteObservacoes
        } = req.body;
        
        const substituicao = await Substituicao.findById(req.params.id);
        if (!substituicao) return res.status(404).json({ success: false, error: 'Não encontrada' });
        
        if (turma) substituicao.turma = turma;
        
        // Atualizar horários (array ou singular)
        if (horarios !== undefined) {
            const lista = normalizarHorarios(horarios, null);
            substituicao.horarios = lista;
            substituicao.horario = lista[0] || null;
        } else if (horario) {
            const lista = normalizarHorarios(null, horario);
            substituicao.horarios = lista;
            substituicao.horario = lista[0] || null;
        }
        
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

// ============================================
// EXCLUIR
// ============================================
router.delete('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Substituicao = getSubstituicaoModel();
        await Substituicao.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Excluída' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DASHBOARD
// ============================================
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
            Substituicao.aggregate([
                { $match: filtro },
                { $addFields: { 
                    horariosFinal: { 
                        $cond: [
                            { $gt: [{ $size: { $ifNull: ['$horarios', []] } }, 0] },
                            '$horarios',
                            { $cond: [{ $ne: ['$horario', null] }, ['$horario'], []] }
                        ]
                    }
                }},
                { $unwind: '$horariosFinal' },
                { $group: { _id: '$horariosFinal', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            Substituicao.find(filtro).sort({ createdAt: -1 }).limit(10).lean(),
            Substituicao.aggregate([{ $match: filtro }, { $group: { _id: '$data', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
            Substituicao.countDocuments({ ...filtro, substitutoAusente: true })
        ]);
        
        const motivosLabels = {
            'falta_professor': 'Falta do Professor', 'licenca_medica': 'Licença Médica',
            'licenca_maternidade_paternidade': 'Licença Mat/Pater', 'capacitacao_formacao': 'Capacitação',
            'reuniao_externa': 'Reunião Externa', 'problema_pessoal': 'Problema Pessoal',
            'atestado': 'Atestado', 'outros': 'Outros', 'sem_substituto': 'Sem Substituto'
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
                turma: s.turma, 
                horarios: getHorariosDe(s),
                horario: s.horario, 
                data: s.data, motivo: s.motivo, registradoEm: s.registradoEm
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RELATÓRIO
// ============================================
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
            'atestado': 'Atestado', 'outros': 'Outros', 'sem_substituto': 'Sem Substituto'
        };
        
        const porMotivo = {}, porTurma = {}, porProfessor = {};
        substituicoes.forEach(s => {
            const label = motivosLabels[s.motivo] || s.motivo;
            porMotivo[label] = (porMotivo[label] || 0) + 1;
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
                turma: s.turma,
                horarios: getHorariosDe(s),
                horario: s.horario,
                data: s.data,
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

// ============================================================================
// 🔥 NOVAS ROTAS: GERENCIAMENTO DE PROFESSORES PELO SETOR PEDAGÓGICO
// (CRUD completo usando a mesma verificação de permissão do módulo)
// ============================================================================

// ============================================
// 🔍 BUSCAR PROFESSOR POR ID (com detalhes completos)
// ============================================
router.get('/professores/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const { id } = req.params;
        
        // Validar ObjectId
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        
        const professor = await User.findById(id)
            .select('nome email cpf telefone matricula eixo departamento titulacao ativo role fotoPerfil createdAt updatedAt twoFactorEnabled lastLogin')
            .lean();
        
        if (!professor) {
            return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        }
        
        // Garantir que é professor (ou admin que também pode dar aula)
        if (professor.role !== 'professor') {
            return res.status(400).json({ 
                success: false, 
                error: `Este usuário não é um professor (role: ${professor.role})` 
            });
        }
        
        res.json({
            success: true,
            professor: {
                id: professor._id,
                nome: professor.nome || '',
                email: professor.email || '',
                cpf: professor.cpf || '',
                telefone: professor.telefone || '',
                matricula: professor.matricula || '',
                eixo: professor.eixo || '',
                departamento: professor.departamento || '',
                titulacao: professor.titulacao || '',
                ativo: professor.ativo !== false,
                role: professor.role,
                fotoPerfil: professor.fotoPerfil || null,
                twoFactorEnabled: professor.twoFactorEnabled || false,
                lastLogin: professor.lastLogin || null,
                createdAt: professor.createdAt,
                updatedAt: professor.updatedAt
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar professor:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ➕ CRIAR NOVO PROFESSOR
// ============================================
router.post('/professores', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const {
            nome, email, cpf, telefone, matricula,
            eixo, departamento, titulacao,
            password, ativo
        } = req.body;
        
        console.log(`📝 [SETOR PEDAGÓGICO] Criando professor: ${email}`);
        
        // ============ VALIDAÇÕES ============
        if (!nome || nome.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'Nome deve ter pelo menos 3 caracteres' });
        }
        
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email é obrigatório' });
        }
        
        if (!validarEmailInstitucional(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email deve ser institucional (@iemasaoluiscentro.net)' 
            });
        }
        
        if (!matricula || matricula.trim() === '') {
            return res.status(400).json({ success: false, error: 'Matrícula é obrigatória' });
        }
        
        if (!cpf) {
            return res.status(400).json({ success: false, error: 'CPF é obrigatório' });
        }
        
        if (!validarCPF(cpf)) {
            return res.status(400).json({ success: false, error: 'CPF inválido' });
        }
        
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Senha deve ter pelo menos 6 caracteres' });
        }
        
        // ============ VERIFICAR DUPLICATAS ============
        const cpfLimpo = cpf.replace(/\D/g, '');
        const emailLower = email.toLowerCase().trim();
        
        const existente = await User.findOne({
            $or: [
                { email: emailLower },
                { cpf: cpfLimpo },
                { matricula: matricula.trim() }
            ]
        });
        
        if (existente) {
            let campo = 'dados';
            if (existente.email === emailLower) campo = 'email';
            else if (existente.cpf === cpfLimpo) campo = 'CPF';
            else if (existente.matricula === matricula.trim()) campo = 'matrícula';
            
            return res.status(400).json({ 
                success: false, 
                error: `Já existe um usuário cadastrado com este ${campo}` 
            });
        }
        
        // ============ CRIAR USUÁRIO ============
        const novoProfessor = new User({
            nome: nome.trim(),
            email: emailLower,
            cpf: cpfLimpo,
            telefone: telefone ? telefone.replace(/\D/g, '') : '',
            matricula: matricula.trim(),
            eixo: eixo || '',
            departamento: departamento || '',
            titulacao: titulacao || '',
            password: password,
            role: 'professor',
            ativo: ativo !== false,
            forcePasswordChange: true, // Deve trocar no primeiro login
            passwordChangedAt: null,
            loginAttempts: 0,
            lockUntil: null,
            twoFactorEnabled: false,
            twoFactorBackupCodes: [],
            twoFactorBackupCodesShown: false,
            twoFactorSecret: null,
            twoFactorTempSecret: null,
            telefoneVerificado: false
        });
        
        await novoProfessor.save();
        
        console.log(`✅ Professor criado: ${novoProfessor.email} (ID: ${novoProfessor._id})`);
        
        // ============ CRIAR NOTIFICAÇÃO ============
        try {
            const Notificacao = require('../models/Notificacao');
            const notif = new Notificacao({
                usuarioId: novoProfessor._id,
                tipo: 'sistema',
                titulo: '👋 Bem-vindo ao EducaPleno!',
                mensagem: `Sua conta de professor foi criada. Você deverá trocar sua senha no primeiro login.`,
                icone: '🎓',
                cor: '#3b82f6',
                link: '/trocar-senha.html',
                prioridade: 4
            });
            await notif.save();
        } catch (notifErr) {
            console.warn('⚠️ Erro ao criar notificação:', notifErr.message);
        }
        
        res.status(201).json({
            success: true,
            message: 'Professor cadastrado com sucesso! Ele deverá trocar a senha no primeiro login.',
            professor: {
                id: novoProfessor._id,
                nome: novoProfessor.nome,
                email: novoProfessor.email,
                matricula: novoProfessor.matricula,
                eixo: novoProfessor.eixo,
                ativo: novoProfessor.ativo,
                forcePasswordChange: novoProfessor.forcePasswordChange
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar professor:', error);
        
        // Tratamento de erros específicos do Mongoose
        if (error.code === 11000) {
            const campo = Object.keys(error.keyPattern || {})[0] || 'campo';
            return res.status(400).json({ 
                success: false, 
                error: `Já existe um usuário com este ${campo}` 
            });
        }
        
        if (error.name === 'ValidationError') {
            const msgs = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ 
                success: false, 
                error: msgs.join('; ') 
            });
        }
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ✏️ EDITAR PROFESSOR
// ============================================
router.put('/professores/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const { id } = req.params;
        const {
            nome, email, cpf, telefone, matricula,
            eixo, departamento, titulacao, ativo
        } = req.body;
        
        console.log(`✏️ [SETOR PEDAGÓGICO] Editando professor ${id}`);
        
        // Validar ObjectId
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        
        const professor = await User.findById(id);
        
        if (!professor) {
            return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        }
        
        if (professor.role !== 'professor') {
            return res.status(400).json({ 
                success: false, 
                error: 'Este usuário não é um professor' 
            });
        }
        
        // ============ VALIDAÇÕES ============
        if (nome !== undefined && (!nome || nome.trim().length < 3)) {
            return res.status(400).json({ success: false, error: 'Nome deve ter pelo menos 3 caracteres' });
        }
        
        if (email !== undefined) {
            if (!validarEmailInstitucional(email)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email deve ser institucional (@iemasaoluiscentro.net)' 
                });
            }
            
            const emailLower = email.toLowerCase().trim();
            if (emailLower !== professor.email) {
                const emailEmUso = await User.findOne({ email: emailLower, _id: { $ne: id } });
                if (emailEmUso) {
                    return res.status(400).json({ success: false, error: 'Email já está em uso' });
                }
            }
        }
        
        if (cpf !== undefined) {
            if (!validarCPF(cpf)) {
                return res.status(400).json({ success: false, error: 'CPF inválido' });
            }
            
            const cpfLimpo = cpf.replace(/\D/g, '');
            if (cpfLimpo !== professor.cpf) {
                const cpfEmUso = await User.findOne({ cpf: cpfLimpo, _id: { $ne: id } });
                if (cpfEmUso) {
                    return res.status(400).json({ success: false, error: 'CPF já está em uso' });
                }
            }
        }
        
        if (matricula !== undefined) {
            const matTrim = matricula.trim();
            if (matTrim !== professor.matricula) {
                const matEmUso = await User.findOne({ matricula: matTrim, _id: { $ne: id } });
                if (matEmUso) {
                    return res.status(400).json({ success: false, error: 'Matrícula já está em uso' });
                }
            }
        }
        
        // ============ ATUALIZAR CAMPOS ============
        if (nome !== undefined) professor.nome = nome.trim();
        if (email !== undefined) professor.email = email.toLowerCase().trim();
        if (cpf !== undefined) professor.cpf = cpf.replace(/\D/g, '');
        if (telefone !== undefined) professor.telefone = telefone.replace(/\D/g, '');
        if (matricula !== undefined) professor.matricula = matricula.trim();
        if (eixo !== undefined) professor.eixo = eixo || '';
        if (departamento !== undefined) professor.departamento = departamento || '';
        if (titulacao !== undefined) professor.titulacao = titulacao || '';
        if (ativo !== undefined) professor.ativo = ativo;
        
        await professor.save();
        
        console.log(`✅ Professor ${professor.email} atualizado`);
        
        res.json({
            success: true,
            message: 'Professor atualizado com sucesso!',
            professor: {
                id: professor._id,
                nome: professor.nome,
                email: professor.email,
                cpf: professor.cpf,
                telefone: professor.telefone,
                matricula: professor.matricula,
                eixo: professor.eixo,
                departamento: professor.departamento,
                titulacao: professor.titulacao,
                ativo: professor.ativo
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao editar professor:', error);
        
        if (error.code === 11000) {
            const campo = Object.keys(error.keyPattern || {})[0] || 'campo';
            return res.status(400).json({ 
                success: false, 
                error: `Já existe um usuário com este ${campo}` 
            });
        }
        
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🗑️ EXCLUIR PROFESSOR
// ============================================
router.delete('/professores/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const { id } = req.params;
        
        console.log(`🗑️ [SETOR PEDAGÓGICO] Excluindo professor ${id}`);
        
        // Validar ObjectId
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        
        const professor = await User.findById(id);
        
        if (!professor) {
            return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        }
        
        if (professor.role !== 'professor') {
            return res.status(400).json({ 
                success: false, 
                error: 'Este usuário não é um professor' 
            });
        }
        
        // ============ VERIFICAR VÍNCULOS ============
        const Prova = require('../models/Prova');
        const Turma = require('../models/Turma');
        
        const [totalProvas, totalTurmas, totalSubstituicoes] = await Promise.all([
            Prova.countDocuments({ userId: id }),
            Turma.countDocuments({ professorId: id }),
            require('../models/SubstituicaoProfessor').countDocuments({
                $or: [
                    { professorAusenteId: id },
                    { professorSubstitutoId: id }
                ]
            })
        ]);
        
        const totalVinculos = totalProvas + totalTurmas + totalSubstituicoes;
        
        if (totalVinculos > 0) {
            let detalhes = [];
            if (totalProvas > 0) detalhes.push(`${totalProvas} prova(s)`);
            if (totalTurmas > 0) detalhes.push(`${totalTurmas} turma(s)`);
            if (totalSubstituicoes > 0) detalhes.push(`${totalSubstituicoes} substituição(ões)`);
            
            return res.status(400).json({
                success: false,
                error: `Este professor possui vínculos: ${detalhes.join(', ')}. Não é possível excluir.`,
                sugestao: 'Recomendamos DESATIVAR o professor em vez de excluí-lo. Assim o histórico é mantido.',
                vinculos: {
                    provas: totalProvas,
                    turmas: totalTurmas,
                    substituicoes: totalSubstituicoes
                }
            });
        }
        
        // ============ EXCLUIR ============
        await User.findByIdAndDelete(id);
        
        console.log(`✅ Professor ${professor.email} excluído permanentemente`);
        
        res.json({
            success: true,
            message: `Professor "${professor.nome}" excluído com sucesso!`
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir professor:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;