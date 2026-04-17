const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RodizioRefeicao = require('../models/RodizioRefeicao'); // 🔥 Usar o modelo existente

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Acesso negado' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.userNome = decoded.nome;
        next();
    });
};

// ============================================
// 🍽️ ROTA PARA ALUNO VER O RODÍZIO DA SUA TURMA
// ============================================
router.get('/meu-rodizio', authenticateToken, async (req, res) => {
    try {
        const alunoId = req.userId;
        
        // Buscar aluno
        const aluno = await User.findById(alunoId);
        if (!aluno || aluno.role !== 'aluno') {
            return res.status(404).json({
                success: false,
                error: 'Aluno não encontrado'
            });
        }
        
        const turma = aluno.turma;
        if (!turma) {
            return res.json({
                success: true,
                podeAlmocarHoje: false,
                motivo: 'Você não possui turma vinculada',
                temRodizio: false,
                horarioInicio: null,
                horarioFim: null,
                diasPermitidos: []
            });
        }
        
        // 🔥 USAR O MÉTODO ESTÁTICO DO MODELO
        const resultado = await RodizioRefeicao.turmaPodeAlmocarHoje(turma);
        
        if (!resultado.config) {
            return res.json({
                success: true,
                podeAlmocarHoje: false,
                motivo: resultado.motivo || 'Nenhuma configuração de rodízio para sua turma',
                temRodizio: false,
                horarioInicio: null,
                horarioFim: null,
                diasPermitidos: []
            });
        }
        
        const config = resultado.config;
        const podeHoje = resultado.pode;
        
        // 🔥 FUNÇÃO PARA VERIFICAR SE PODE ALMOÇAR EM UMA DATA ESPECÍFICA
        function podeAlmocarNaData(config, data) {
            const diaSemana = data.getDay(); // 0-6 (Domingo a Sábado)
            const diaMes = data.getDate();
            
            // Calcular semana do mês (1-5)
            const primeiraSemana = new Date(data.getFullYear(), data.getMonth(), 1);
            const semanaMes = Math.ceil((diaMes + primeiraSemana.getDay()) / 7);
            
            let pode = false;
            
            if (config.tipoRodizio === 'semanal' || config.tipoRodizio === 'ambos') {
                if (config.diasSemana && config.diasSemana.includes(diaSemana)) {
                    pode = true;
                }
            }
            
            if (!pode && (config.tipoRodizio === 'mensal' || config.tipoRodizio === 'ambos')) {
                if (config.diasMes && config.diasMes.includes(diaMes)) {
                    pode = true;
                }
                if (config.semanasMes && config.semanasMes.includes(semanaMes)) {
                    pode = true;
                }
            }
            
            return pode;
        }
        
        // Calcular próximos 14 dias
        const hoje = new Date();
        const diasPermitidos = [];
        
        for (let i = 0; i <= 14; i++) {
            const data = new Date();
            data.setDate(hoje.getDate() + i);
            const pode = podeAlmocarNaData(config, data);
            
            diasPermitidos.push({
                data: data.toISOString(),
                dataFormatada: data.toLocaleDateString('pt-BR', { 
                    weekday: 'long', 
                    day: '2-digit', 
                    month: '2-digit' 
                }),
                dataSimples: data.toLocaleDateString('pt-BR'),
                podeAlmocar: pode,
                diaSemana: data.getDay()
            });
        }
        
        // Filtrar apenas os dias que pode almoçar (próximos 7)
        const proximosDias = diasPermitidos.filter(d => d.podeAlmocar).slice(0, 7);
        
        res.json({
            success: true,
            turma: turma,
            temRodizio: true,
            podeAlmocarHoje: podeHoje,
            horarioInicio: config.horarioInicio,
            horarioFim: config.horarioFim,
            tipoRodizio: config.tipoRodizio,
            descricao: config.descricao,
            diasPermitidos: proximosDias,
            todosDias: diasPermitidos
        });
        
    } catch (error) {
        console.error('Erro ao buscar rodízio do aluno:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar informações do rodízio: ' + error.message
        });
    }
});

// ============================================
// 🔍 ROTA PARA VER RODÍZIO DE UMA TURMA ESPECÍFICA (OPCIONAL)
// ============================================
router.get('/turma/:nomeTurma', authenticateToken, async (req, res) => {
    try {
        const { nomeTurma } = req.params;
        
        // Verificar permissão (apenas admin, gestão geral ou professor)
        const allowedRoles = ['admin', 'super_admin', 'gestao_geral', 'professor'];
        if (!allowedRoles.includes(req.userRole)) {
            return res.status(403).json({
                success: false,
                error: 'Acesso negado. Apenas administradores e gestão geral podem acessar.'
            });
        }
        
        const resultado = await RodizioRefeicao.turmaPodeAlmocarHoje(nomeTurma);
        
        res.json({
            success: true,
            turma: nomeTurma,
            podeAlmocarHoje: resultado.pode,
            motivo: resultado.motivo,
            config: resultado.config ? {
                tipoRodizio: resultado.config.tipoRodizio,
                diasSemana: resultado.config.diasSemana,
                diasMes: resultado.config.diasMes,
                semanasMes: resultado.config.semanasMes,
                horarioInicio: resultado.config.horarioInicio,
                horarioFim: resultado.config.horarioFim,
                ativo: resultado.config.ativo,
                descricao: resultado.config.descricao
            } : null
        });
        
    } catch (error) {
        console.error('Erro ao buscar rodízio da turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar informações do rodízio: ' + error.message
        });
    }
});

module.exports = router;