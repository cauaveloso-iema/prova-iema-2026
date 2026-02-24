// backend/middleware/admin.js
const adminMiddleware = (req, res, next) => {
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado. Apenas administradores podem acessar esta rota.'
        });
    }
    next();
};

module.exports = adminMiddleware;