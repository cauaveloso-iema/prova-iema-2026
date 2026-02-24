// ============ backend/services/matricula-service.js ============
const MatriculaAutorizada = require('../models/MatriculaAutorizada');
const mongoose = require('mongoose');

class MatriculaService {
    
    constructor() {
        // Inicializar com dados padrão quando a classe for instanciada
        this.inicializarDadosPadrao();
    }
    
    // Inicializar dados padrão (chamado automaticamente)
    async inicializarDadosPadrao() {
        try {
            console.log('🔍 Verificando se existem matrículas no banco...');
            
            // Verificar se já existem matrículas no banco
            const total = await MatriculaAutorizada.countDocuments();
            
            if (total === 0) {
                console.log('📥 Nenhuma matrícula encontrada. Importando dados iniciais...');
                
                // Importar dados do arquivo
                const dadosIniciais = require('../matriculas-autorizados');
                let importadas = 0;
                let ignoradas = 0;
                let erros = 0;
                
                // Usar um ID de sistema para as importações iniciais
                const sistemaId = new mongoose.Types.ObjectId('000000000000000000000001');
                
                // Verificar se MATRICULAS_PROFESSORES_AUTORIZADOS existe
                const listaMatriculas = dadosIniciais.MATRICULAS_PROFESSORES_AUTORIZADOS || [];
                
                for (const item of listaMatriculas) {
                    try {
                        // Verificar se é objeto ou string (o arquivo atual tem só strings)
                        const matricula = typeof item === 'string' ? item : item.matricula;
                        const nome = typeof item === 'string' ? 'Professor' : (item.nome || 'Professor');
                        
                        // Verificar se já existe
                        const existe = await MatriculaAutorizada.findOne({ matricula });
                        
                        if (!existe) {
                            const nova = new MatriculaAutorizada({
                                matricula: matricula,
                                nome: nome,
                                criadoPor: sistemaId,
                                ativo: true
                            });
                            
                            await nova.save();
                            importadas++;
                            console.log(`  ✅ Importada: ${matricula} - ${nome}`);
                        } else {
                            ignoradas++;
                            console.log(`  ⏭️ Já existe: ${matricula}`);
                        }
                    } catch (e) {
                        erros++;
                        console.log(`  ⚠️ Erro ao importar ${item}: ${e.message}`);
                    }
                }
                
                console.log(`✅ Importação concluída: ${importadas} adicionadas, ${ignoradas} ignoradas, ${erros} erros`);
            } else {
                console.log(`✅ Banco já possui ${total} matrículas cadastradas.`);
            }
            
        } catch (error) {
            console.error('❌ Erro ao inicializar dados padrão:', error);
        }
    }
    
    // Listar todas as matrículas
    async listar(busca = '') {
        try {
            let query = { ativo: true };
            
            if (busca) {
                query.$or = [
                    { matricula: { $regex: busca, $options: 'i' } },
                    { nome: { $regex: busca, $options: 'i' } }
                ];
            }
            
            const matriculas = await MatriculaAutorizada.find(query)
                .sort({ matricula: 1 })
                .lean();
            
            return {
                success: true,
                matriculas,
                total: matriculas.length
            };
            
        } catch (error) {
            console.error('❌ Erro ao listar matrículas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Verificar se matrícula existe
    async verificarMatricula(matricula) {
        try {
            const existe = await MatriculaAutorizada.findOne({ 
                matricula: matricula,
                ativo: true 
            });
            
            return {
                success: true,
                autorizada: !!existe,
                nome: existe ? existe.nome : null
            };
            
        } catch (error) {
            console.error('❌ Erro ao verificar matrícula:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Adicionar nova matrícula
    async adicionar(matricula, nome, usuarioId) {
        try {
            // Verificar se já existe
            const existe = await MatriculaAutorizada.findOne({ matricula });
            
            if (existe) {
                if (existe.ativo) {
                    return {
                        success: false,
                        error: 'Matrícula já está cadastrada'
                    };
                } else {
                    // Reativar se estiver inativa
                    existe.ativo = true;
                    existe.nome = nome;
                    existe.atualizadoPor = usuarioId;
                    existe.atualizadoEm = new Date();
                    await existe.save();
                    
                    return {
                        success: true,
                        matricula: existe.matricula,
                        nome: existe.nome,
                        reativado: true
                    };
                }
            }
            
            // Criar nova
            const nova = new MatriculaAutorizada({
                matricula,
                nome,
                criadoPor: usuarioId
            });
            
            await nova.save();
            
            return {
                success: true,
                matricula: nova.matricula,
                nome: nova.nome
            };
            
        } catch (error) {
            console.error('❌ Erro ao adicionar matrícula:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Editar matrícula
    async editar(matriculaAntiga, novaMatricula, novoNome, usuarioId) {
        try {
            const matricula = await MatriculaAutorizada.findOne({ 
                matricula: matriculaAntiga 
            });
            
            if (!matricula) {
                return {
                    success: false,
                    error: 'Matrícula não encontrada'
                };
            }
            
            // Se estiver mudando a matrícula, verificar se a nova já existe
            if (matriculaAntiga !== novaMatricula) {
                const existe = await MatriculaAutorizada.findOne({ 
                    matricula: novaMatricula 
                });
                
                if (existe && existe.ativo) {
                    return {
                        success: false,
                        error: 'Nova matrícula já está em uso'
                    };
                }
            }
            
            matricula.matricula = novaMatricula;
            matricula.nome = novoNome;
            matricula.atualizadoPor = usuarioId;
            matricula.atualizadoEm = new Date();
            
            await matricula.save();
            
            return {
                success: true,
                matricula: matricula.matricula,
                nome: matricula.nome
            };
            
        } catch (error) {
            console.error('❌ Erro ao editar matrícula:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Excluir matrícula (soft delete)
    async excluir(matricula, usuarioId) {
        try {
            const mat = await MatriculaAutorizada.findOne({ matricula });
            
            if (!mat) {
                return {
                    success: false,
                    error: 'Matrícula não encontrada'
                };
            }
            
            // Soft delete (apenas marcar como inativo)
            mat.ativo = false;
            mat.atualizadoPor = usuarioId;
            mat.atualizadoEm = new Date();
            
            await mat.save();
            
            return {
                success: true,
                removido: {
                    matricula: mat.matricula,
                    nome: mat.nome
                }
            };
            
        } catch (error) {
            console.error('❌ Erro ao excluir matrícula:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Forçar recarregamento dos dados (útil após reiniciar)
    async recarregarDados() {
        await this.inicializarDadosPadrao();
    }
}

module.exports = MatriculaService;