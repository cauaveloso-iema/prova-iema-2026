// backend/routes/atraso-professor-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ============================================
// HELPERS
// ============================================
function getAtrasoModel() { return require('../models/AtrasoProfessor'); }
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
            modulo: 'substituicao_professores_setor_pedagogico', // Reutiliza a mesma permissão
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
// MOTIVOS LABELS
// ============================================
const MOTIVOS_LABELS = {
    'problema_transporte': 'Problema de Transporte',
    'problema_pessoal': 'Problema Pessoal',
    'problema_saude': 'Problema de Saúde',
    'transito': 'Trânsito',
    'clima': 'Condições Climáticas',
    'outros': 'Outros',
    'nao_justificado': 'Não Justificado'
};

// ============================================
// ROTA: LISTAR PROFESSORES (reutiliza lógica)
// ============================================
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
                id: p._id,
                nome: p.nome,
                email: p.email,
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

// ============================================
// ROTA: LISTAR TURMAS
// ============================================
router.get('/turmas', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const User = getUserModel();
        const turmas = await User.distinct('turma', {
            role: 'aluno',
            ativo: true,
            turma: { $ne: null, $exists: true, $ne: '' }
        });
        
        const turmasValidas = turmas
            .filter(t => t && t.trim() !== '')
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        
        res.json({ success: true, turmas: turmasValidas, total: turmasValidas.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA: REGISTRAR ATRASO
// ============================================
router.post('/registrar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Atraso = getAtrasoModel();
        const User = getUserModel();
        
        const {
            professorId,
            data,
            horario,
            horarioChegada,
            minutosAtraso,
            turma,
            observacoes,
            motivo,
            motivoDetalhes
        } = req.body;
        
        // ============ VALIDAÇÕES ============
        if (!professorId) {
            return res.status(400).json({ success: false, error: 'Selecione o professor' });
        }
        
        if (!data) {
            return res.status(400).json({ success: false, error: 'Informe a data' });
        }
        
        if (!horario || horario < 1 || horario > 9) {
            return res.status(400).json({ success: false, error: 'Horário deve ser entre 1 e 9' });
        }
        
        // ============ BUSCAR PROFESSOR ============
        const professor = await User.findById(professorId)
            .select('nome email telefone eixo matricula')
            .lean();
        
        if (!professor) {
            return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        }
        
        // ============ VERIFICAR DUPLICIDADE ============
        // Não permitir dois atrasos para o mesmo professor, na mesma data e horário
        const jaExiste = await Atraso.findOne({
            professorId,
            data,
            horario,
            ativo: true
        });
        
        if (jaExiste) {
            return res.status(409).json({
                success: false,
                error: `Já existe um atraso registrado para ${professor.nome} em ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')} no ${horario}º horário.`
            });
        }
        
        // ============ MONTAR DADOS ============
        const dataObj = new Date(data + 'T12:00:00');
        const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const diaSemana = diasSemana[dataObj.getDay()];
        const mesReferencia = data.substring(0, 7);
        
        const novoAtraso = new Atraso({
            professorId: professor._id,
            professorNome: professor.nome,
            professorEmail: professor.email || '',
            professorTelefone: professor.telefone || '',
            professorEixo: professor.eixo || '',
            professorMatricula: professor.matricula || '',
            
            data,
            diaSemana,
            horario: parseInt(horario),
            horarioChegada: horarioChegada || '',
            minutosAtraso: parseInt(minutosAtraso) || 0,
            turma: turma || '',
            observacoes: observacoes || '',
            motivo: motivo || 'nao_justificado',
            motivoDetalhes: motivoDetalhes || '',
            
            mesReferencia,
            registradoPor: req.userId,
            registradoPorNome: req.userNome,
            registradoPorEmail: req.userEmail
        });
        
        await novoAtraso.save();
        
        res.status(201).json({
            success: true,
            message: 'Atraso registrado com sucesso!',
            atraso: novoAtraso
        });
        
    } catch (error) {
        console.error('❌ Erro ao registrar atraso:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA: LISTAR ATRASOS
// ============================================
router.get('/listar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Atraso = getAtrasoModel();
        const { 
            mes, 
            dataInicio, 
            dataFim, 
            professorId, 
            motivo, 
            busca,
            limit = 50, 
            page = 1 
        } = req.query;
        
        let filtro = { ativo: true };
        
        if (mes) filtro.mesReferencia = mes;
        
        if (dataInicio || dataFim) {
            filtro.data = {};
            if (dataInicio) filtro.data.$gte = dataInicio;
            if (dataFim) filtro.data.$lte = dataFim;
        }
        
        if (professorId) filtro.professorId = professorId;
        if (motivo) filtro.motivo = motivo;
        
        if (busca) {
            const regex = { $regex: busca, $options: 'i' };
            filtro.$or = [
                { professorNome: regex },
                { turma: regex },
                { observacoes: regex }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [atrasos, total] = await Promise.all([
            Atraso.find(filtro)
                .sort({ data: -1, horario: 1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Atraso.countDocuments(filtro)
        ]);
        
        res.json({
            success: true,
            atrasos: atrasos.map(a => ({
                id: a._id,
                professorId: a.professorId,
                professorNome: a.professorNome,
                professorEmail: a.professorEmail,
                professorEixo: a.professorEixo,
                professorMatricula: a.professorMatricula,
                data: a.data,
                dataFormatada: new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                diaSemana: a.diaSemana,
                horario: a.horario,
                horarioChegada: a.horarioChegada,
                minutosAtraso: a.minutosAtraso,
                turma: a.turma,
                observacoes: a.observacoes,
                motivo: a.motivo,
                motivoLabel: MOTIVOS_LABELS[a.motivo] || a.motivo,
                motivoDetalhes: a.motivoDetalhes,
                mesReferencia: a.mesReferencia,
                registradoPor: a.registradoPorNome,
                registradoEm: a.registradoEm,
                editadoPorNome: a.editadoPorNome,
                editadoEm: a.editadoEm
            })),
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar atrasos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA: BUSCAR ATRASO POR ID
// ============================================
router.get('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Atraso = getAtrasoModel();
        const atraso = await Atraso.findById(req.params.id).lean();
        
        if (!atraso) {
            return res.status(404).json({ success: false, error: 'Atraso não encontrado' });
        }
        
        res.json({ success: true, atraso });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA: EDITAR ATRASO
// ============================================
router.put('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Atraso = getAtrasoModel();
        const {
            data,
            horario,
            horarioChegada,
            minutosAtraso,
            turma,
            observacoes,
            motivo,
            motivoDetalhes
        } = req.body;
        
        const atraso = await Atraso.findById(req.params.id);
        
        if (!atraso) {
            return res.status(404).json({ success: false, error: 'Atraso não encontrado' });
        }
        
        // Verificar duplicidade se mudou data/horário
        if (data || horario) {
            const novaData = data || atraso.data;
            const novoHorario = horario ? parseInt(horario) : atraso.horario;
            
            if (novaData !== atraso.data || novoHorario !== atraso.horario) {
                const jaExiste = await Atraso.findOne({
                    _id: { $ne: req.params.id },
                    professorId: atraso.professorId,
                    data: novaData,
                    horario: novoHorario,
                    ativo: true
                });
                
                if (jaExiste) {
                    return res.status(409).json({
                        success: false,
                        error: 'Já existe um atraso registrado para este professor nesta data e horário.'
                    });
                }
            }
        }
        
        // Atualizar campos
        if (data) {
            atraso.data = data;
            atraso.mesReferencia = data.substring(0, 7);
            const dataObj = new Date(data + 'T12:00:00');
            const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
            atraso.diaSemana = dias[dataObj.getDay()];
        }
        
        if (horario) atraso.horario = parseInt(horario);
        if (horarioChegada !== undefined) atraso.horarioChegada = horarioChegada;
        if (minutosAtraso !== undefined) atraso.minutosAtraso = parseInt(minutosAtraso) || 0;
        if (turma !== undefined) atraso.turma = turma;
        if (observacoes !== undefined) atraso.observacoes = observacoes;
        if (motivo) atraso.motivo = motivo;
        if (motivoDetalhes !== undefined) atraso.motivoDetalhes = motivoDetalhes;
        
        atraso.editadoPor = req.userId;
        atraso.editadoPorNome = req.userNome;
        atraso.editadoEm = new Date();
        
        await atraso.save();
        
        res.json({
            success: true,
            message: 'Atraso atualizado com sucesso!',
            atraso
        });
        
    } catch (error) {
        console.error('❌ Erro ao editar atraso:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA: EXCLUIR ATRASO
// ============================================
router.delete('/:id', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Atraso = getAtrasoModel();
        const atraso = await Atraso.findByIdAndDelete(req.params.id);
        
        if (!atraso) {
            return res.status(404).json({ success: false, error: 'Atraso não encontrado' });
        }
        
        res.json({ success: true, message: 'Atraso excluído com sucesso!' });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA: DASHBOARD - RESUMO
// ============================================
router.get('/dashboard/resumo', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Atraso = getAtrasoModel();
        const mes = req.query.mes || new Date().toISOString().substring(0, 7);
        const filtro = { mesReferencia: mes, ativo: true };
        
        const [
            totalMes,
            porMotivo,
            porProfessor,
            porHorario,
            atrasosPorDia,
            ultimosAtrasos,
            porTurma,
            totalMinutos
        ] = await Promise.all([
            // Total do mês
            Atraso.countDocuments(filtro),
            
            // Por motivo
            Atraso.aggregate([
                { $match: filtro },
                { $group: { _id: '$motivo', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            
            // Professores que mais atrasaram
            Atraso.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: '$professorId',
                        nome: { $first: '$professorNome' },
                        eixo: { $first: '$professorEixo' },
                        matricula: { $first: '$professorMatricula' },
                        count: { $sum: 1 },
                        totalMinutos: { $sum: '$minutosAtraso' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            
            // Por horário
            Atraso.aggregate([
                { $match: filtro },
                { $group: { _id: '$horario', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            
            // Por dia
            Atraso.aggregate([
                { $match: filtro },
                { $group: { _id: '$data', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            
            // Últimos atrasos
            Atraso.find(filtro)
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            
            // Por turma
            Atraso.aggregate([
                { $match: { ...filtro, turma: { $ne: '', $exists: true } } },
                { $group: { _id: '$turma', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 15 }
            ]),
            
            // Total de minutos
            Atraso.aggregate([
                { $match: filtro },
                { $group: { _id: null, total: { $sum: '$minutosAtraso' } } }
            ])
        ]);
        
        // Calcular média diária
        const diasComAtraso = atrasosPorDia.length || 1;
        const mediaDiaria = (totalMes / diasComAtraso).toFixed(1);
        
        // Total de minutos formatado
        const totalMin = totalMinutos[0]?.total || 0;
        const horas = Math.floor(totalMin / 60);
        const mins = totalMin % 60;
        const totalFormatado = horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;
        
        res.json({
            success: true,
            mesReferencia: mes,
            resumo: {
                totalMes,
                mediaDiaria,
                totalMinutos: totalMin,
                totalFormatado
            },
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: MOTIVOS_LABELS[m._id] || m._id,
                count: m.count
            })),
            professoresMaisAtrasam: porProfessor.map(p => ({
                id: p._id,
                nome: p.nome,
                eixo: p.eixo,
                matricula: p.matricula,
                count: p.count,
                totalMinutos: p.totalMinutos
            })),
            porHorario: porHorario.map(h => ({
                horario: h._id,
                count: h.count
            })),
            atrasosPorDia: atrasosPorDia.map(d => ({
                data: d._id,
                count: d.count
            })),
            porTurma: porTurma.map(t => ({
                turma: t._id || 'Sem turma',
                count: t.count
            })),
            ultimosAtrasos: ultimosAtrasos.map(a => ({
                id: a._id,
                professorNome: a.professorNome,
                professorEixo: a.professorEixo,
                data: a.data,
                dataFormatada: new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                horario: a.horario,
                minutosAtraso: a.minutosAtraso,
                motivo: a.motivo,
                motivoLabel: MOTIVOS_LABELS[a.motivo] || a.motivo,
                registradoEm: a.registradoEm
            }))
        });
        
    } catch (error) {
        console.error('❌ Erro no dashboard de atrasos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA: RELATÓRIO
// ============================================
router.get('/relatorio/gerar', authenticateToken, verificarPermissaoModulo, async (req, res) => {
    try {
        const Atraso = getAtrasoModel();
        const {
            mes,
            dataInicio,
            dataFim,
            professorId,
            motivo
        } = req.query;
        
        let filtro = { ativo: true };
        
        if (mes) filtro.mesReferencia = mes;
        
        if (dataInicio || dataFim) {
            filtro.data = {};
            if (dataInicio) filtro.data.$gte = dataInicio;
            if (dataFim) filtro.data.$lte = dataFim;
        }
        
        if (professorId) filtro.professorId = professorId;
        if (motivo) filtro.motivo = motivo;
        
        const atrasos = await Atraso.find(filtro)
            .sort({ data: -1, horario: 1 })
            .lean();
        
        // Estatísticas
        const porMotivo = {};
        const porProfessor = {};
        const porHorario = {};
        let totalMinutos = 0;
        
        atrasos.forEach(a => {
            const labelMotivo = MOTIVOS_LABELS[a.motivo] || a.motivo;
            porMotivo[labelMotivo] = (porMotivo[labelMotivo] || 0) + 1;
            
            porProfessor[a.professorNome] = (porProfessor[a.professorNome] || 0) + 1;
            
            porHorario[a.horario] = (porHorario[a.horario] || 0) + 1;
            
            totalMinutos += a.minutosAtraso || 0;
        });
        
        const horas = Math.floor(totalMinutos / 60);
        const mins = totalMinutos % 60;
        const totalFormatado = horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;
        
        res.json({
            success: true,
            total: atrasos.length,
            totalMinutos,
            totalFormatado,
            estatisticas: {
                porMotivo,
                porProfessor,
                porHorario
            },
            atrasos: atrasos.map(a => ({
                id: a._id,
                professorNome: a.professorNome,
                professorEixo: a.professorEixo,
                professorMatricula: a.professorMatricula,
                data: a.data,
                dataFormatada: new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                diaSemana: a.diaSemana,
                horario: a.horario,
                horarioChegada: a.horarioChegada,
                minutosAtraso: a.minutosAtraso,
                turma: a.turma,
                observacoes: a.observacoes,
                motivo: a.motivo,
                motivoLabel: MOTIVOS_LABELS[a.motivo] || a.motivo,
                motivoDetalhes: a.motivoDetalhes,
                registradoPor: a.registradoPorNome,
                registradoEm: a.registradoEm
            }))
        });
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório de atrasos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;