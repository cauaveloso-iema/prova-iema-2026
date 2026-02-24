// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Acesso negado. Token não fornecido.' 
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                error: 'Token inválido ou expirado.' 
            });
        }
        
        req.userId = user.id;
        req.userRole = user.role;
        req.userNome = user.nome;
        next();
    });
};

module.exports = authMiddleware;