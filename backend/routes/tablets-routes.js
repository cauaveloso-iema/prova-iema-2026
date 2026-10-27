// ============================================================================
// ROUTES - Tablets
// ============================================================================
// Descrição: Rotas para gerenciamento de tablets e termos de entrega
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const Tablet = require('../models/Tablet');

let logger;
try {
  logger = require('../utils/logger');
} catch (err) {
  logger = console;
}

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id).select('nome email role ativo');
    if (!user || !user.ativo) {
      return res.status(403).json({ success: false, error: 'Usuário inválido ou inativo' });
    }
    
    req.userId = user._id;
    req.userNome = user.nome;
    req.userEmail = user.email;
    req.userRole = user.role;
    
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
  }
};

const isAdmin = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.userRole)) {
    return res.status(403).json({ 
      success: false, 
      error: 'Apenas administradores podem acessar este recurso' 
    });
  }
  next();
};

// ========== HEALTH CHECK ==========
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Tablets',
    models: {
      Tablet: !!Tablet
    }
  });
});

// ============================================================================
// ROTAS PROTEGIDAS (a partir daqui, tudo requer admin)
// ============================================================================
router.use(authenticateToken);
router.use(isAdmin);

// ========== LISTAR SETORES DISPONÍVEIS ==========
router.get('/setores', async (req, res) => {
  try {
    const roles = await User.distinct('role', { ativo: true });
    
    const labels = {
      'professor': 'Professor',
      'setor_pedagogico': 'Setor Pedagógico',
      'coordenacao_patio': 'Coordenação de Pátio',
      'cozinha': 'Cozinha',
      'gestao_geral': 'Gestão Geral',
      'enfermaria': 'Enfermaria',
      'supervisao': 'Supervisão',
      'psicologia': 'Psicologia',
      'assistente-social': 'Assistente Social',
      'protagonismo': 'Protagonismo',
      'biblioteca': 'Biblioteca',
      'secretaria': 'Secretaria',
      'recepcao': 'Recepção',
      'gestao-adm': 'Gestão Administrativa',
      'admin': 'Administrador',
      'super_admin': 'Super Administrador',
      'aluno': 'Aluno'
    };
    
    const setores = roles
      .filter(r => labels[r])
      .map(r => ({ value: r, label: labels[r] }))
      .sort((a, b) => a.label.localeCompare(b.label));
    
    res.json({ success: true, setores });
    
  } catch (error) {
    logger.error('❌ Erro ao listar setores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== LISTAR RESPONSÁVEIS POR SETOR ==========
router.get('/responsaveis/:setor', async (req, res) => {
  try {
    const { setor } = req.params;
    
    if (!setor) {
      return res.status(400).json({ success: false, error: 'Setor é obrigatório' });
    }
    
    const responsaveis = await User.find({ 
      role: setor, 
      ativo: true 
    })
      .select('nome email matricula role departamento curso turma eixo')
      .sort({ nome: 1 })
      .lean();
    
    res.json({
      success: true,
      responsaveis: responsaveis.map(r => ({
        id: r._id,
        nome: r.nome,
        email: r.email,
        matricula: r.matricula,
        role: r.role,
        departamento: r.departamento,
        curso: r.curso,
        turma: r.turma,
        eixo: r.eixo
      })),
      total: responsaveis.length
    });
    
  } catch (error) {
    logger.error('❌ Erro ao listar responsáveis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== ESTATÍSTICAS ==========
router.get('/estatisticas', async (req, res) => {
  try {
    const [
      total,
      pendentes,
      entregues,
      devolvidos,
      comAssinatura,
      impressos
    ] = await Promise.all([
      Tablet.countDocuments(),
      Tablet.countDocuments({ status: 'pendente' }),
      Tablet.countDocuments({ status: 'entregue' }),
      Tablet.countDocuments({ status: 'devolvido' }),
      Tablet.countDocuments({ 'termo.temAssinatura': true }),
      Tablet.countDocuments({ solicitouImpressao: true })
    ]);
    
    res.json({
      success: true,
      estatisticas: {
        total,
        porStatus: { pendente: pendentes, entregue: entregues, devolvido: devolvidos },
        assinatura: {
          comAssinatura,
          semAssinatura: total - comAssinatura,
          percentualAssinado: total > 0 ? ((comAssinatura / total) * 100).toFixed(1) : 0
        },
        impressao: { impressos, naoImpressos: total - impressos }
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== LISTAR TABLETS ==========
router.get('/', async (req, res) => {
  try {
    const { status, setor, busca, assinado, impresso, page = 1, limit = 20, ordenar = 'recente' } = req.query;
    
    let query = {};
    
    if (status && status !== 'todos') query.status = status;
    if (setor && setor !== 'todos') query.setor = setor;
    
    if (assinado === 'sim') query['termo.temAssinatura'] = true;
    else if (assinado === 'nao') query['termo.temAssinatura'] = { $ne: true };
    
    if (impresso === 'sim') query.solicitouImpressao = true;
    else if (impresso === 'nao') query.solicitouImpressao = { $ne: true };
    
    if (busca && busca.trim()) {
      const termo = busca.trim();
      query.$or = [
        { numero: { $regex: termo, $options: 'i' } },
        { responsavelNome: { $regex: termo, $options: 'i' } },
        { responsavelEmail: { $regex: termo, $options: 'i' } },
        { responsavelMatricula: { $regex: termo, $options: 'i' } },
        { setorLabel: { $regex: termo, $options: 'i' } }
      ];
    }
    
    const ordenacoes = {
      'recente': { createdAt: -1 },
      'antigo': { createdAt: 1 },
      'numero': { numero: 1 },
      'responsavel': { responsavelNome: 1 },
      'status': { status: 1 }
    };
    
    const sort = ordenacoes[ordenar] || ordenacoes.recente;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [tablets, total] = await Promise.all([
      Tablet.find(query).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
      Tablet.countDocuments(query)
    ]);
    
    const tabletsFormatados = tablets.map(t => ({
      id: t._id,
      _id: t._id,
      numero: t.numero,
      marca: t.marca || '',
      modelo: t.modelo || '',
      imei: t.imei || '',
      patrimonio: t.patrimonio || '',
      setor: t.setor,
      setorLabel: t.setorLabel || t.setor,
      responsavel: {
        id: t.responsavelId,
        nome: t.responsavelNome,
        email: t.responsavelEmail,
        matricula: t.responsavelMatricula,
        role: t.responsavelRole,
        cargo: t.responsavelCargo
      },
      status: t.status,
      termo: {
        sessaoId: t.termo?.sessaoId,
        assinaturaBase64: t.termo?.assinaturaBase64,
        assinadaPorNome: t.termo?.assinadaPorNome,
        assinadaPorCpf: t.termo?.assinadaPorCpf,
        assinadaEm: t.termo?.assinadaEm,
        temAssinatura: t.termo?.temAssinatura || false,
        aceiteTermo: t.termo?.aceiteTermo || false
      },
      solicitouImpressao: t.solicitouImpressao || false,
      impressoEm: t.impressoEm,
      impressoPorNome: t.impressoPorNome,
      totalImpressoes: t.totalImpressoes || 0,
      dataEntrega: t.dataEntrega,
      entreguePorNome: t.entreguePorNome,
      dataDevolucao: t.dataDevolucao,
      devolvidoPorNome: t.devolvidoPorNome,
      motivoDevolucao: t.motivoDevolucao,
      observacoes: t.observacoes,
      registradoPorNome: t.registradoPorNome,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }));
    
    res.json({
      success: true,
      tablets: tabletsFormatados,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro ao listar tablets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== BUSCAR TABLET POR ID ==========
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    
    const tablet = await Tablet.findById(id).lean();
    
    if (!tablet) {
      return res.status(404).json({ success: false, error: 'Tablet não encontrado' });
    }
    
    res.json({
      success: true,
      tablet: {
        id: tablet._id,
        _id: tablet._id,
        numero: tablet.numero,
        marca: tablet.marca,
        modelo: tablet.modelo,
        imei: tablet.imei,
        patrimonio: tablet.patrimonio,
        setor: tablet.setor,
        setorLabel: tablet.setorLabel,
        responsavel: {
          id: tablet.responsavelId,
          nome: tablet.responsavelNome,
          email: tablet.responsavelEmail,
          matricula: tablet.responsavelMatricula,
          role: tablet.responsavelRole,
          cargo: tablet.responsavelCargo
        },
        status: tablet.status,
        termo: tablet.termo || {},
        solicitouImpressao: tablet.solicitouImpressao,
        impressoEm: tablet.impressoEm,
        impressoPorNome: tablet.impressoPorNome,
        totalImpressoes: tablet.totalImpressoes,
        dataEntrega: tablet.dataEntrega,
        entreguePorNome: tablet.entreguePorNome,
        dataDevolucao: tablet.dataDevolucao,
        devolvidoPorNome: tablet.devolvidoPorNome,
        motivoDevolucao: tablet.motivoDevolucao,
        observacoes: tablet.observacoes,
        registradoPorNome: tablet.registradoPorNome,
        createdAt: tablet.createdAt,
        updatedAt: tablet.updatedAt
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro ao buscar tablet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== CRIAR TABLET ==========
router.post('/', async (req, res) => {
  try {
    const { numero, marca, modelo, imei, patrimonio, setor, setorLabel, responsavelId, observacoes } = req.body;
    
    if (!numero || !numero.trim()) {
      return res.status(400).json({ success: false, error: 'Número do tablet é obrigatório' });
    }
    if (!setor) {
      return res.status(400).json({ success: false, error: 'Setor é obrigatório' });
    }
    if (!responsavelId) {
      return res.status(400).json({ success: false, error: 'Responsável é obrigatório' });
    }
    
    const existe = await Tablet.findOne({ numero: numero.trim() });
    if (existe) {
      return res.status(400).json({ 
        success: false, 
        error: `Já existe um tablet com o número "${numero}"` 
      });
    }
    
    const responsavel = await User.findById(responsavelId).select('nome email matricula role departamento');
    if (!responsavel) {
      return res.status(404).json({ success: false, error: 'Responsável não encontrado' });
    }
    
    const tablet = new Tablet({
      numero: numero.trim(),
      marca: marca?.trim() || '',
      modelo: modelo?.trim() || '',
      imei: imei?.trim() || '',
      patrimonio: patrimonio?.trim() || '',
      setor,
      setorLabel: setorLabel || setor,
      responsavelId: responsavel._id,
      responsavelNome: responsavel.nome,
      responsavelEmail: responsavel.email || '',
      responsavelMatricula: responsavel.matricula || '',
      responsavelRole: responsavel.role || '',
      responsavelCargo: responsavel.departamento || '',
      observacoes: observacoes?.trim() || '',
      status: 'pendente',
      registradoPor: req.userId,
      registradoPorNome: req.userNome
    });
    
    await tablet.save();
    
    logger.info(`✅ Tablet ${tablet.numero} criado por ${req.userNome}`);
    
    res.status(201).json({
      success: true,
      message: 'Tablet registrado com sucesso!',
      tablet: {
        id: tablet._id,
        numero: tablet.numero,
        setor: tablet.setor,
        setorLabel: tablet.setorLabel,
        responsavelNome: tablet.responsavelNome,
        status: tablet.status
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro ao criar tablet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== ATUALIZAR TABLET ==========
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    
    const tablet = await Tablet.findById(id);
    if (!tablet) {
      return res.status(404).json({ success: false, error: 'Tablet não encontrado' });
    }
    
    // Se mudou o número, verifica duplicidade
    if (req.body.numero && req.body.numero !== tablet.numero) {
      const existe = await Tablet.findOne({ numero: req.body.numero, _id: { $ne: id } });
      if (existe) {
        return res.status(400).json({ 
          success: false, 
          error: `Já existe um tablet com o número "${req.body.numero}"` 
        });
      }
    }
    
    const camposPermitidos = ['numero', 'marca', 'modelo', 'imei', 'patrimonio', 'setor', 'setorLabel', 'observacoes', 'status'];
    
    camposPermitidos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        tablet[campo] = typeof req.body[campo] === 'string' ? req.body[campo].trim() : req.body[campo];
      }
    });
    
    // Se mudou o responsável
    if (req.body.responsavelId && req.body.responsavelId.toString() !== tablet.responsavelId.toString()) {
      const responsavel = await User.findById(req.body.responsavelId).select('nome email matricula role departamento');
      if (!responsavel) {
        return res.status(404).json({ success: false, error: 'Responsável não encontrado' });
      }
      tablet.responsavelId = responsavel._id;
      tablet.responsavelNome = responsavel.nome;
      tablet.responsavelEmail = responsavel.email || '';
      tablet.responsavelMatricula = responsavel.matricula || '';
      tablet.responsavelRole = responsavel.role || '';
      tablet.responsavelCargo = responsavel.departamento || '';
    }
    
    tablet.atualizadoPor = req.userId;
    tablet.atualizadoPorNome = req.userNome;
    
    await tablet.save();
    
    logger.info(`✏️ Tablet ${tablet.numero} atualizado por ${req.userNome}`);
    
    res.json({
      success: true,
      message: 'Tablet atualizado com sucesso!',
      tablet: {
        id: tablet._id,
        numero: tablet.numero,
        status: tablet.status
      }
    });
    
  } catch (error) {
    logger.error('❌ Erro ao atualizar tablet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== EXCLUIR TABLET ==========
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmacao } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    
    const tablet = await Tablet.findById(id);
    if (!tablet) {
      return res.status(404).json({ success: false, error: 'Tablet não encontrado' });
    }
    
    // 🔥 Se tem assinatura, exige confirmação por texto
    if (tablet.termo?.temAssinatura) {
      if (confirmacao !== 'CONFIRMAR') {
        return res.status(400).json({ 
          success: false, 
          error: 'Tablet possui assinatura. Envie "confirmacao": "CONFIRMAR" no body para forçar exclusão.',
          precisaConfirmacao: true,
          codigo: 'REQUER_CONFIRMACAO'
        });
      }
    }
    
    await Tablet.findByIdAndDelete(id);
    
    logger.info(`🗑️ Tablet ${tablet.numero} excluído por ${req.userNome}${tablet.termo?.temAssinatura ? ' (COM assinatura)' : ''}`);
    
    res.json({ success: true, message: 'Tablet excluído com sucesso!' });
    
  } catch (error) {
    logger.error('❌ Erro ao excluir tablet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== SOLICITAR IMPRESSÃO ==========
router.post('/:id/imprimir', async (req, res) => {
  try {
    const { id } = req.params;
    
    const tablet = await Tablet.findById(id);
    if (!tablet) {
      return res.status(404).json({ success: false, error: 'Tablet não encontrado' });
    }
    
    if (!tablet.termo?.temAssinatura) {
      return res.status(400).json({ 
        success: false, 
        error: 'O tablet precisa estar assinado antes de imprimir o termo' 
      });
    }
    
    await tablet.registrarImpressao(req.userId, req.userNome);
    
    logger.info(`🖨️ Termo do tablet ${tablet.numero} solicitado para impressão por ${req.userNome}`);
    
    res.json({
      success: true,
      message: 'Solicitação de impressão registrada!',
      totalImpressoes: tablet.totalImpressoes,
      impressoEm: tablet.impressoEm
    });
    
  } catch (error) {
    logger.error('❌ Erro ao solicitar impressão:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== DEVOLVER TABLET ==========
router.post('/:id/devolver', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    const tablet = await Tablet.findById(id);
    if (!tablet) {
      return res.status(404).json({ success: false, error: 'Tablet não encontrado' });
    }
    
    if (tablet.status === 'devolvido') {
      return res.status(400).json({ success: false, error: 'Tablet já está marcado como devolvido' });
    }
    
    tablet.status = 'devolvido';
    tablet.dataDevolucao = new Date();
    tablet.devolvidoPor = req.userId;
    tablet.devolvidoPorNome = req.userNome;
    tablet.motivoDevolucao = motivo || '';
    
    await tablet.save();
    
    logger.info(`↩️ Tablet ${tablet.numero} devolvido por ${req.userNome}`);
    
    res.json({
      success: true,
      message: 'Tablet devolvido com sucesso!',
      tablet: { id: tablet._id, numero: tablet.numero, status: tablet.status }
    });
    
  } catch (error) {
    logger.error('❌ Erro ao devolver tablet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== REENVIAR QR CODE (nova sessão de assinatura) ==========
router.post('/:id/reenviar-qrcode', async (req, res) => {
  try {
    const { id } = req.params;
    const crypto = require('crypto');
    
    const tablet = await Tablet.findById(id);
    if (!tablet) {
      return res.status(404).json({ success: false, error: 'Tablet não encontrado' });
    }
    
    if (tablet.termo?.temAssinatura) {
      return res.status(400).json({ 
        success: false, 
        error: 'Este tablet já foi assinado. Use "Refazer assinatura" se necessário.' 
      });
    }
    
    const sessaoId = crypto.randomBytes(16).toString('hex');
    const SessaoAssinatura = require('../models/SessaoAssinatura');
    
    const sessao = new SessaoAssinatura({
      sessaoId,
      tipo: 'tablet',
      status: 'aguardando',
      dadosAtendimento: {
        tabletId: tablet._id,
        numero: tablet.numero,
        marca: tablet.marca,
        modelo: tablet.modelo,
        imei: tablet.imei,
        patrimonio: tablet.patrimonio,
        setor: tablet.setor,
        setorLabel: tablet.setorLabel,
        responsavelId: tablet.responsavelId,
        responsavelNome: tablet.responsavelNome,
        responsavelEmail: tablet.responsavelEmail,
        responsavelMatricula: tablet.responsavelMatricula,
        responsavelRole: tablet.responsavelRole,
        responsavelCargo: tablet.responsavelCargo,
        dataEntrega: new Date().toISOString(),
        observacoes: tablet.observacoes
      },
      criadoPor: req.userId,
      criadoPorNome: req.userNome,
      expiraEm: new Date(Date.now() + 30 * 60 * 1000)
    });
    
    sessao.markModified('dadosAtendimento');
    await sessao.save();
    
    tablet.termo.sessaoId = sessaoId;
    await tablet.save();
    
    logger.info(`📱 Nova sessão de assinatura criada para tablet ${tablet.numero}: ${sessaoId}`);
    
    res.json({
      success: true,
      message: 'Nova sessão de assinatura criada!',
      sessaoId,
      expiraEm: sessao.expiraEm
    });
    
  } catch (error) {
    logger.error('❌ Erro ao reenviar QR code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;