const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
        req.userId = user.id;
        req.userRole = user.role;
        next();
    });
};

const somenteGestaoAdm = (req, res, next) => {
    if (['gestao-adm', 'admin', 'super_admin'].includes(req.userRole)) return next();
    return res.status(403).json({ success: false, error: 'Acesso negado' });
};

// GET /api/gestao-adm/dashboard - Estatísticas do painel
router.get('/dashboard', authenticateToken, somenteGestaoAdm, async (req, res) => {
    try {
        const [totalUsuarios, totalAlunos, totalProfessores, usuariosOnline] = await Promise.all([
            User.countDocuments({ ativo: { $ne: false } }),
            User.countDocuments({ role: 'aluno', ativo: { $ne: false } }),
            User.countDocuments({ role: 'professor', ativo: { $ne: false } }),
            User.countDocuments({
                ultimoAcesso: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
                ativo: { $ne: false }
            })
        ]);

        res.json({
            success: true,
            data: {
                totalUsuarios,
                totalAlunos,
                totalProfessores,
                usuariosOnline
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;