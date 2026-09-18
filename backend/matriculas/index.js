// backend/matriculas/index.js
// Gerenciador de matrículas - MongoDB + fallback ENCRYPTED_MATRICULAS
// Fonte de verdade: MongoDB (persiste no Render)
// Fallback: ENCRYPTED_MATRICULAS do .env (para importação inicial)

const { decryptData } = require('./crypto-utils');
const mongoose = require('mongoose');

console.log('='.repeat(60));
console.log('🔐 INICIALIZANDO GERENCIADOR DE MATRÍCULAS (MongoDB)');
console.log('='.repeat(60));

class MatriculasManager {
    constructor() {
        this.cache = null;
        this.cacheTime = null;
        this.CACHE_DURATION = 30 * 1000; // 30 segundos
        this.importado = false;
        this.MatriculaAutorizada = null;
    }

    // ========== LAZY LOAD DO MODEL (evita problema de ordem de import) ==========
    getModel() {
        if (!this.MatriculaAutorizada) {
            try {
                this.MatriculaAutorizada = require('../models/MatriculaAutorizada');
            } catch (e) {
                console.error('❌ Erro ao carregar modelo MatriculaAutorizada:', e.message);
                return null;
            }
        }
        return this.MatriculaAutorizada;
    }

    // ========== IMPORTAR DADOS INICIAIS (só se banco vazio) ==========
    async importarDadosIniciais() {
        if (this.importado) return;

        const Model = this.getModel();
        if (!Model) {
            console.error('❌ Modelo MatriculaAutorizada não disponível');
            return;
        }

        try {
            const total = await Model.countDocuments();

            if (total > 0) {
                console.log(`✅ Banco já possui ${total} matrículas. Pulando importação.`);
                this.importado = true;
                return;
            }

            console.log('📥 Banco vazio. Importando matrículas iniciais do .env...');

            if (!process.env.ENCRYPTED_MATRICULAS) {
                console.warn('⚠️ ENCRYPTED_MATRICULAS não configurado no .env');
                this.importado = true;
                return;
            }

            const dadosIniciais = decryptData(process.env.ENCRYPTED_MATRICULAS);

            if (!dadosIniciais || !Array.isArray(dadosIniciais)) {
                console.error('❌ Falha ao descriptografar ENCRYPTED_MATRICULAS');
                this.importado = true;
                return;
            }

            console.log(`🔓 ${dadosIniciais.length} matrículas descriptografadas`);

            const sistemaId = new mongoose.Types.ObjectId('000000000000000000000001');
            let importadas = 0;
            let ignoradas = 0;

            for (const item of dadosIniciais) {
                try {
                    await Model.create({
                        matricula: item.matricula,
                        nome: item.nome,
                        criadoPor: sistemaId,
                        ativo: true
                    });
                    importadas++;
                } catch (e) {
                    if (e.code === 11000) {
                        ignoradas++;
                    } else {
                        console.error(`⚠️ Erro ao importar ${item.matricula}:`, e.message);
                    }
                }
            }

            console.log(`✅ Importadas: ${importadas}, Ignoradas: ${ignoradas}`);
            this.importado = true;
            this.limparCache();

        } catch (error) {
            console.error('❌ Erro ao importar dados iniciais:', error);
        }
    }

    // ========== CACHE ==========
    async carregar() {
        const agora = Date.now();
        if (this.cache && this.cacheTime && (agora - this.cacheTime) < this.CACHE_DURATION) {
            return this.cache;
        }

        const Model = this.getModel();
        if (!Model) return this.cache || [];

        try {
            const matriculas = await Model.find({ ativo: true })
                .select('matricula nome -_id')
                .lean();
            
            this.cache = matriculas;
            this.cacheTime = agora;
            return matriculas;
        } catch (error) {
            console.error('❌ Erro ao carregar matrículas:', error);
            return this.cache || [];
        }
    }

    limparCache() {
        this.cache = null;
        this.cacheTime = null;
    }

    // ========== VERIFICAÇÕES (assíncronas) ==========
    async verificar(matricula) {
        const Model = this.getModel();
        if (!Model) return false;

        try {
            const existe = await Model.findOne({ matricula, ativo: true }).lean();
            return !!existe;
        } catch (error) {
            console.error('❌ Erro ao verificar matrícula:', error);
            return false;
        }
    }

    async obterNome(matricula) {
        const Model = this.getModel();
        if (!Model) return null;

        try {
            const doc = await Model.findOne({ matricula, ativo: true }).select('nome').lean();
            return doc ? doc.nome : null;
        } catch (error) {
            return null;
        }
    }

    // ========== VERIFICAÇÕES SÍNCRONAS (usam cache) ==========
    verificarMatricula(matricula) {
        if (!this.cache) return false;
        return this.cache.some(item => item.matricula === matricula);
    }

    listar() {
        return this.cache || [];
    }

    async listarAsync() {
        await this.carregar();
        return this.cache || [];
    }

    // ========== CRUD ==========
    async adicionar(matricula, nome, usuarioId = null) {
        const Model = this.getModel();
        if (!Model) return { success: false, error: 'Modelo indisponível' };

        try {
            const existente = await Model.findOne({ matricula });

            if (existente) {
                if (existente.ativo) {
                    return { success: false, error: 'Matrícula já existe' };
                }
                existente.ativo = true;
                existente.nome = nome;
                existente.atualizadoPor = usuarioId;
                existente.atualizadoEm = new Date();
                await existente.save();
                this.limparCache();
                return { success: true, matricula, nome, reativado: true };
            }

            const nova = new Model({
                matricula,
                nome,
                criadoPor: usuarioId,
                ativo: true
            });
            await nova.save();
            this.limparCache();
            return { success: true, matricula, nome };

        } catch (error) {
            console.error('❌ Erro ao adicionar:', error);
            return { success: false, error: error.message };
        }
    }

    async editar(matriculaAntiga, novaMatricula, novoNome, usuarioId = null) {
        const Model = this.getModel();
        if (!Model) return { success: false, error: 'Modelo indisponível' };

        try {
            const doc = await Model.findOne({ matricula: matriculaAntiga });
            if (!doc) return { success: false, error: 'Matrícula não encontrada' };

            if (matriculaAntiga !== novaMatricula) {
                const existe = await Model.findOne({
                    matricula: novaMatricula,
                    ativo: true
                });
                if (existe) return { success: false, error: 'Nova matrícula já existe' };
            }

            doc.matricula = novaMatricula;
            doc.nome = novoNome;
            doc.atualizadoPor = usuarioId;
            doc.atualizadoEm = new Date();
            await doc.save();
            this.limparCache();
            return { success: true, matricula: novaMatricula, nome: novoNome };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async excluir(matricula, usuarioId = null) {
        const Model = this.getModel();
        if (!Model) return { success: false, error: 'Modelo indisponível' };

        try {
            const doc = await Model.findOne({ matricula });
            if (!doc) return { success: false, error: 'Matrícula não encontrada' };

            doc.ativo = false;
            doc.atualizadoPor = usuarioId;
            doc.atualizadoEm = new Date();
            await doc.save();
            this.limparCache();
            return { success: true, removido: { matricula: doc.matricula, nome: doc.nome } };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async buscar(termo) {
        const Model = this.getModel();
        if (!Model) return [];

        try {
            if (!termo) {
                return await Model.find({ ativo: true }).lean();
            }
            return await Model.find({
                ativo: true,
                $or: [
                    { matricula: { $regex: termo, $options: 'i' } },
                    { nome: { $regex: termo, $options: 'i' } }
                ]
            }).lean();
        } catch (error) {
            return [];
        }
    }

    async contar() {
        const Model = this.getModel();
        if (!Model) return 0;

        try {
            return await Model.countDocuments({ ativo: true });
        } catch (error) {
            return 0;
        }
    }
}

module.exports = new MatriculasManager();