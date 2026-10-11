// utils/mascararParaAdmin.js
// ============================================
// 🔒 MASCARAR DADOS SENSÍVEIS PARA ADMIN
// ============================================
// Regra:
//   - Se for admin e NÃO foi ele quem criou → mascara
//   - Se for admin E foi ele quem criou → vê tudo
//   - Se for super_admin → vê tudo
//   - Se for o profissional do módulo (supervisao, enfermaria, etc) → vê tudo
// ============================================

const MASCARA_TEXTO = '🔒 Conteúdo protegido (visível apenas para o profissional responsável)';

// ============================================
// CAMPOS SENSÍVEIS POR MÓDULO
// ============================================
const CAMPOS_SENSIVEIS = {
    // ============================================
    // SUPERVISÃO
    // ============================================
    'supervisao': {
        raiz: [],
        entrada: ['descricao', 'observacoes', 'assinaturaBase64'],
        saida: ['resultadoTexto', 'observacoesFinais'],
        detalhes: 'TODOS',
        remarcacoes: ['motivoRemarcacao', 'observacoesRemarcacao']
    },

    // ============================================
    // ENFERMARIA
    // ============================================
    'enfermaria': {
        raiz: [],
        entrada: ['queixa', 'observacoes'],
        saida: ['observacoes'],
        detalhes: [],
        remarcacoes: []
    },

    // ============================================
    // ASSISTENTE SOCIAL
    // ============================================
    'assistente-social': {
        raiz: [],
        entrada: ['descricao', 'observacoes', 'assinaturaBase64'],
        saida: ['resultadoTexto', 'observacoesFinais'],
        detalhes: 'TODOS',
        remarcacoes: ['motivoRemarcacao', 'observacoesRemarcacao']
    }

    // Adicione outros módulos conforme for implementando
};

// ============================================
// 🎯 FUNÇÃO PRINCIPAL
// ============================================
function mascararParaAdmin(dados, modulo, req) {
    // Não tem req ou userRole? Retorna tudo intacto
    if (!req || !req.userRole) {
        return dados;
    }

    // Não é admin nem super_admin? Retorna tudo intacto
    if (!['admin', 'super_admin'].includes(req.userRole)) {
        return dados;
    }

    // Super admin vê tudo sempre
    if (req.userRole === 'super_admin') {
        return dados;
    }

    const campos = CAMPOS_SENSIVEIS[modulo];
    if (!campos) return dados;

    // Se for array, processa cada item
    if (Array.isArray(dados)) {
        return dados.map(item => mascararItem(item, campos, req));
    }

    return mascararItem(dados, campos, req);
}

// ============================================
// 🔒 MASCARAR UM ITEM
// ============================================
function mascararItem(item, campos, req) {
    if (!item) return item;

    // Converte para objeto puro (caso seja documento Mongoose)
    const obj = item.toObject ? item.toObject() : JSON.parse(JSON.stringify(item));

    // 🎯 REGRA PRINCIPAL: se o admin foi quem criou, NÃO mascara
    const adminId = req.userId?.toString();
    const criadorId = (
        obj.entrada?.registradoPor ||
        obj.criadoPor ||
        obj.profissionalId
    )?.toString();

    if (criadorId && adminId && criadorId === adminId) {
        // Admin é o criador → vê tudo
        obj._mascarado = false;
        obj._criadoPorMim = true;
        return obj;
    }

    // Admin NÃO é o dono → mascara
    obj._mascarado = true;
    obj._criadoPorMim = false;

    // ===== MASCARAR CAMPOS DA RAIZ =====
    (campos.raiz || []).forEach(campo => {
        if (obj[campo] !== undefined && obj[campo] !== null && obj[campo] !== '') {
            obj[campo] = MASCARA_TEXTO;
        }
    });

    // ===== MASCARAR CAMPOS DE entrada =====
    if (obj.entrada && campos.entrada) {
        campos.entrada.forEach(campo => {
            if (obj.entrada[campo] !== undefined && obj.entrada[campo] !== null && obj.entrada[campo] !== '') {
                obj.entrada[campo] = campo === 'assinaturaBase64' ? null : MASCARA_TEXTO;
            }
        });
    }

    // ===== MASCARAR CAMPOS DE saida =====
    if (obj.saida && campos.saida) {
        campos.saida.forEach(campo => {
            if (obj.saida[campo] !== undefined && obj.saida[campo] !== null && obj.saida[campo] !== '') {
                obj.saida[campo] = MASCARA_TEXTO;
            }
        });
    }

    // ===== MASCARAR detalhes (todos os campos) =====
    if (obj.detalhes && campos.detalhes === 'TODOS') {
        const chaves = Object.keys(obj.detalhes);
        chaves.forEach(chave => {
            const valor = obj.detalhes[chave];
            if (Array.isArray(valor)) {
                obj.detalhes[chave] = [MASCARA_TEXTO];
            } else if (valor !== undefined && valor !== null && valor !== '') {
                obj.detalhes[chave] = MASCARA_TEXTO;
            }
        });
    }

    // ===== MASCARAR remarcações =====
    if (Array.isArray(obj.remarcacoes) && campos.remarcacoes && campos.remarcacoes.length > 0) {
        obj.remarcacoes = obj.remarcacoes.map(rem => {
            const novaRem = { ...rem };
            campos.remarcacoes.forEach(campo => {
                if (novaRem[campo] !== undefined && novaRem[campo] !== null && novaRem[campo] !== '') {
                    novaRem[campo] = MASCARA_TEXTO;
                }
            });
            return novaRem;
        });
    }

    return obj;
}

// ============================================
// 🚫 BLOQUEAR EDIÇÃO/EXCLUSÃO POR ADMIN
// ============================================
function adminPodeEditar(atendimento, req) {
    // Não é admin? Sempre pode
    if (!req || !['admin', 'super_admin'].includes(req.userRole)) {
        return { permitido: true };
    }

    // Super admin pode sempre
    if (req.userRole === 'super_admin') {
        return { permitido: true };
    }

    // Admin: só pode se foi ele quem criou
    const adminId = req.userId?.toString();
    const criadorId = (
        atendimento?.entrada?.registradoPor ||
        atendimento?.criadoPor ||
        atendimento?.profissionalId
    )?.toString();

    if (criadorId === adminId) {
        return { permitido: true };
    }

    return {
        permitido: false,
        motivo: 'Você não pode editar/excluir atendimentos criados por outros profissionais.'
    };
}

module.exports = {
    mascararParaAdmin,
    adminPodeEditar,
    MASCARA_TEXTO
};