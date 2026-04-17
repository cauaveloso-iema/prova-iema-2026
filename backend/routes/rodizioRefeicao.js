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
// ============================================
// 🍽️ ROTA PARA ALUNO VER O RODÍZIO DA SUA TURMA
// ============================================
router.get('/meu-rodizio', authenticateToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const usuarioRole = req.userRole;
        
        // ========== 1. VERIFICAR PERMISSÃO (APENAS ALUNOS) ==========
        if (usuarioRole !== 'aluno') {
            return res.status(403).json({
                success: false,
                error: 'Acesso negado. Apenas alunos podem consultar o rodízio de refeições.',
                role: usuarioRole
            });
        }
        
        // ========== 2. BUSCAR DADOS DO ALUNO ==========
        const aluno = await User.findById(usuarioId).select('nome turma role matricula');
        
        if (!aluno) {
            return res.status(404).json({
                success: false,
                error: 'Aluno não encontrado. Verifique seus dados de cadastro.'
            });
        }
        
        // ========== 3. VERIFICAR SE ALUNO TEM TURMA VINCULADA ==========
        const turma = aluno.turma;
        
        if (!turma || turma.trim() === '') {
            return res.json({
                success: true,
                podeAlmocarHoje: false,
                motivo: 'Você não possui turma vinculada. Entre em contato com a coordenação.',
                temRodizio: false,
                horarioInicio: null,
                horarioFim: null,
                diasPermitidos: [],
                sugestao: 'Solicite ao seu professor ou à coordenação que vincule sua turma.'
            });
        }
        
        console.log(`👨‍🎓 Aluno ${aluno.nome} (${aluno.matricula || 'sem matrícula'}) - Turma: ${turma}`);
        
        // ========== 4. BUSCAR CONFIGURAÇÃO DE RODÍZIO PARA A TURMA ==========
        const resultado = await RodizioRefeicao.turmaPodeAlmocarHoje(turma);
        
        // ========== 5. SE NÃO HÁ CONFIGURAÇÃO DE RODÍZIO ==========
        if (!resultado.config) {
            return res.json({
                success: true,
                turma: turma,
                podeAlmocarHoje: false,
                motivo: resultado.motivo || `Nenhuma configuração de rodízio para a turma ${turma}`,
                temRodizio: false,
                horarioInicio: null,
                horarioFim: null,
                diasPermitidos: [],
                sugestao: 'A Gestão Geral ainda não configurou o rodízio para sua turma.'
            });
        }
        
        // ========== 6. EXTRAIR DADOS DO RODÍZIO ==========
        const config = resultado.config;
        const podeHoje = resultado.pode;
        
        console.log(`📋 Rodízio encontrado para turma ${turma}:`);
        console.log(`   Tipo: ${config.tipoRodizio}`);
        console.log(`   Horário: ${config.horarioInicio} - ${config.horarioFim}`);
        console.log(`   Ativo: ${config.ativo ? 'Sim' : 'Não'}`);
        
        // ========== 7. FUNÇÃO PARA VERIFICAR SE PODE ALMOÇAR EM UMA DATA ==========
        function podeAlmocarNaData(config, data) {
            const diaSemana = data.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
            const diaMes = data.getDate();    // 1-31
            
            // Calcular semana do mês (1-5)
            const primeiraSemana = new Date(data.getFullYear(), data.getMonth(), 1);
            const diaSemanaPrimeiro = primeiraSemana.getDay();
            const semanaMes = Math.ceil((diaMes + diaSemanaPrimeiro) / 7);
            
            let pode = false;
            let motivo = '';
            
            // Verificar rodízio semanal
            if (config.tipoRodizio === 'semanal' || config.tipoRodizio === 'ambos') {
                if (config.diasSemana && config.diasSemana.includes(diaSemana)) {
                    pode = true;
                    motivo = `Dia da semana permitido (${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][diaSemana]})`;
                }
            }
            
            // Verificar rodízio mensal (se ainda não pode)
            if (!pode && (config.tipoRodizio === 'mensal' || config.tipoRodizio === 'ambos')) {
                if (config.diasMes && config.diasMes.includes(diaMes)) {
                    pode = true;
                    motivo = `Dia do mês permitido (${diaMes})`;
                }
                else if (config.semanasMes && config.semanasMes.includes(semanaMes)) {
                    pode = true;
                    motivo = `Semana do mês permitida (${semanaMes}ª semana)`;
                }
            }
            
            return { pode, motivo };
        }
        
        // ========== 8. CALCULAR PRÓXIMOS 14 DIAS ==========
        const hoje = new Date();
        const diasPermitidos = [];
        
        for (let i = 0; i <= 14; i++) {
            const data = new Date();
            data.setDate(hoje.getDate() + i);
            const resultadoDia = podeAlmocarNaData(config, data);
            
            diasPermitidos.push({
                data: data.toISOString(),
                dataFormatada: data.toLocaleDateString('pt-BR', { 
                    weekday: 'long', 
                    day: '2-digit', 
                    month: '2-digit' 
                }),
                dataSimples: data.toLocaleDateString('pt-BR'),
                podeAlmocar: resultadoDia.pode,
                motivo: resultadoDia.motivo,
                diaSemana: data.getDay()
            });
        }
        
        // ========== 9. FILTRAR PRÓXIMOS DIAS QUE PODE ALMOÇAR ==========
        const proximosDias = diasPermitidos.filter(d => d.podeAlmocar).slice(0, 7);
        
        // ========== 10. MONTAR RESPOSTA ==========
        res.json({
            success: true,
            turma: turma,
            temRodizio: true,
            podeAlmocarHoje: podeHoje,
            horarioInicio: config.horarioInicio,
            horarioFim: config.horarioFim,
            tipoRodizio: config.tipoRodizio,
            descricao: config.descricao || '',
            diasPermitidos: proximosDias,
            todosDias: diasPermitidos,
            estatisticas: {
                diasSemanaPermitidos: config.diasSemana || [],
                diasMesPermitidos: config.diasMes || [],
                semanasMesPermitidas: config.semanasMes || []
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar rodízio do aluno:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar informações do rodízio. Tente novamente mais tarde.',
            detalhes: process.env.NODE_ENV === 'development' ? error.message : undefined
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