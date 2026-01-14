const express = require('express');
const router = express.Router();
const Resultado = require('../models/Resultado');
const Prova = require('../models/Prova');

// Middleware simples para verificar se é professor
// (Você pode usar JWT depois)
const verificarProfessor = async (req, res, next) => {
    try {
        // Verificar se o token está no header
        const token = req.headers.authorization;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token não fornecido'
            });
        }
        
        // Em produção, você verificaria o token JWT
        // Por enquanto, vamos aceitar qualquer token
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Token inválido'
        });
    }
};

// ROTA 1: Listar todos os resultados (apenas professor)
router.get('/professor', verificarProfessor, async (req, res) => {
    try {
        // Buscar todos os resultados
        const resultados = await Resultado.find()
            .populate('alunoId', 'nome email')
            .populate('provaId', 'titulo conteudo')
            .populate('turmaId', 'nome')
            .sort({ dataEntrega: -1 });

        // Calcular estatísticas
        const total = resultados.length;
        const completos = resultados.filter(r => r.completa).length;
        const media = total > 0 
            ? resultados.reduce((sum, r) => sum + r.nota, 0) / total 
            : 0;

        res.json({
            success: true,
            total,
            completos,
            pendentes: total - completos,
            media: media.toFixed(1),
            resultados: resultados
        });

    } catch (error) {
        console.error('Erro ao buscar resultados:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

// ROTA 2: Resultados de uma prova específica
router.get('/prova/:provaId', verificarProfessor, async (req, res) => {
    try {
        const { provaId } = req.params;

        // Verificar se a prova existe
        const prova = await Prova.findById(provaId);
        if (!prova) {
            return res.status(404).json({
                success: false,
                error: 'Prova não encontrada'
            });
        }

        // Buscar resultados desta prova
        const resultados = await Resultado.find({ provaId })
            .populate('alunoId', 'nome email matricula')
            .sort({ nota: -1 });

        if (resultados.length === 0) {
            return res.json({
                success: true,
                mensagem: 'Nenhum aluno completou esta prova ainda',
                prova: {
                    titulo: prova.titulo,
                    conteudo: prova.conteudo
                },
                resultados: []
            });
        }

        // Estatísticas
        const totalAlunos = resultados.length;
        const alunosCompletaram = resultados.filter(r => r.completa).length;
        const mediaNotas = resultados.reduce((sum, r) => sum + r.nota, 0) / totalAlunos;
        const maiorNota = Math.max(...resultados.map(r => r.nota));
        const menorNota = Math.min(...resultados.map(r => r.nota));

        // Distribuição de notas
        const distribuicao = {
            excelente: resultados.filter(r => r.nota >= 90).length,
            bom: resultados.filter(r => r.nota >= 70 && r.nota < 90).length,
            regular: resultados.filter(r => r.nota >= 50 && r.nota < 70).length,
            insuficiente: resultados.filter(r => r.nota < 50).length
        };

        res.json({
            success: true,
            prova: {
                _id: prova._id,
                titulo: prova.titulo,
                conteudo: prova.conteudo,
                totalQuestoes: prova.questoes.length
            },
            resultados: resultados,
            estatisticas: {
                totalAlunos,
                alunosCompletaram,
                alunosPendentes: totalAlunos - alunosCompletaram,
                mediaNotas: mediaNotas.toFixed(1),
                maiorNota: maiorNota.toFixed(1),
                menorNota: menorNota.toFixed(1),
                distribuicao
            }
        });

    } catch (error) {
        console.error('Erro ao buscar resultados da prova:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

// ROTA 3: Detalhes de um resultado específico
router.get('/detalhe/:resultadoId', verificarProfessor, async (req, res) => {
    try {
        const { resultadoId } = req.params;

        const resultado = await Resultado.findById(resultadoId)
            .populate('alunoId', 'nome email matricula')
            .populate('provaId', 'titulo conteudo questoes');

        if (!resultado) {
            return res.status(404).json({
                success: false,
                error: 'Resultado não encontrado'
            });
        }

        const prova = resultado.provaId;
        
        // Preparar respostas das questões
        const questoesComRespostas = prova.questoes.map((questao, index) => {
            const respostaAluno = resultado.respostas[index];
            const acertou = respostaAluno === questao.respostaCorreta;
            
            return {
                numero: index + 1,
                pergunta: questao.pergunta,
                opcoes: questao.opcoes,
                respostaAluno: respostaAluno !== null ? respostaAluno : null,
                respostaCorreta: questao.respostaCorreta,
                acertou: acertou,
                explicacao: questao.explicacao
            };
        });

        // Contar acertos
        const totalQuestoes = prova.questoes.length;
        const respondidas = resultado.respostas.filter(r => r !== null).length;
        const acertos = prova.questoes.reduce((count, questao, index) => {
            return count + (resultado.respostas[index] === questao.respostaCorreta ? 1 : 0);
        }, 0);

        res.json({
            success: true,
            resultado: {
                _id: resultado._id,
                nota: resultado.nota,
                tempoGasto: resultado.tempoGasto,
                completa: resultado.completa,
                dataEntrega: resultado.dataEntrega
            },
            aluno: resultado.alunoId,
            prova: {
                _id: prova._id,
                titulo: prova.titulo,
                conteudo: prova.conteudo
            },
            questoes: questoesComRespostas,
            resumo: {
                totalQuestoes,
                respondidas,
                acertos,
                taxaAcerto: ((acertos / totalQuestoes) * 100).toFixed(1)
            }
        });

    } catch (error) {
        console.error('Erro ao buscar detalhes do resultado:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

// ROTA 4: Resultados por turma
router.get('/turma/:turmaId', verificarProfessor, async (req, res) => {
    try {
        const { turmaId } = req.params;

        const resultados = await Resultado.find({ turmaId })
            .populate('alunoId', 'nome email')
            .populate('provaId', 'titulo')
            .sort({ dataEntrega: -1 });

        // Agrupar por aluno
        const alunos = {};
        resultados.forEach(resultado => {
            const alunoId = resultado.alunoId._id.toString();
            if (!alunos[alunoId]) {
                alunos[alunoId] = {
                    aluno: resultado.alunoId,
                    resultados: [],
                    media: 0
                };
            }
            alunos[alunoId].resultados.push(resultado);
        });

        // Calcular média por aluno
        Object.keys(alunos).forEach(alunoId => {
            const aluno = alunos[alunoId];
            aluno.media = aluno.resultados.length > 0
                ? aluno.resultados.reduce((sum, r) => sum + r.nota, 0) / aluno.resultados.length
                : 0;
        });

        res.json({
            success: true,
            turmaId,
            totalResultados: resultados.length,
            totalAlunos: Object.keys(alunos).length,
            alunos: Object.values(alunos)
        });

    } catch (error) {
        console.error('Erro ao buscar resultados da turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

module.exports = router;