// ============================================
// chatbot.js - Backend COMPLETO E FUNCIONAL (TODOS OS PERFIS)
// ============================================

const Groq = require('groq-sdk');

// ============================================
// CONFIGURAÇÃO DOS MODELOS
// ============================================
const MODELOS_GROQ = {
  RAPIDO: 'openai/gpt-oss-20b',
  BALANCEADO: 'qwen/qwen3.6-27b',
  PODEROSO: 'openai/gpt-oss-120b',
  SEGURO: 'openai/gpt-oss-safeguard-20b',
  FALLBACK: 'qwen/qwen3.6-27b'
};

// ============================================
// INFORMAÇÕES COMPLETAS DO SISTEMA
// ============================================
const SISTEMA_INFO = {
  nome: 'Sistema de Provas Online',
  emailSuporte: 'caua.veloso@iemasaoluiscentro.net',
  telefoneSuporte: '(98) 98308-6504',
  site: 'sistemadeprovas.com',
  
  recuperacaoSenha: {
    passo1: 'Clique em "Esqueci minha senha" na tela de login',
    passo2: 'Digite seu email cadastrado',
    passo3: 'Receba um link de redefinição por email',
    passo4: 'Clique no link e defina uma nova senha',
    observacao: 'O link é válido por 1 hora'
  }
};

// ============================================
// FUNCIONALIDADES POR PERFIL
// ============================================

// ===== PERFIL: LOGIN =====
const LOGIN = {
  menu: ['Login', 'Criar Conta', 'Recuperar Senha'],
  funcionalidades: {
    'login': {
      titulo: '🔐 Login',
      descricao: 'Acessar sua conta no sistema',
      comoFazer: 'Preencha email/CPF e senha, clique em "Entrar"',
      observacao: 'Use "Esqueci minha senha" se não lembrar',
      dica: 'Verifique se o Caps Lock está desativado'
    },
    'criar conta': {
      titulo: '📝 Criar Conta',
      descricao: 'Criar uma nova conta no sistema',
      comoFazer: 'Clique em "Criar conta" e preencha os dados',
      passos: [
        '📝 Nome completo',
        '📧 Email institucional (@iemasaoluiscentro.net)',
        '🆔 CPF',
        '📱 Telefone',
        '👤 Escolha o perfil',
        '🔑 Crie uma senha segura (mínimo 6 caracteres)',
        '✅ Clique em "Cadastrar"'
      ],
      dica: 'Após o cadastro, você receberá um email de confirmação'
    },
    'recuperar senha': {
      titulo: '🔑 Recuperar Senha',
      descricao: 'Recuperar sua senha caso tenha esquecido',
      comoFazer: 'Clique em "Esqueci minha senha" na tela de login',
      passos: [
        '1️⃣ Digite seu email cadastrado',
        '2️⃣ Receba um link de redefinição por email',
        '3️⃣ Clique no link e defina uma nova senha'
      ],
      observacao: '⏰ O link é válido por 1 hora',
      dica: 'Verifique a pasta de spam se não receber o email'
    }
  }
};

// ===== PERFIL: ALUNO =====
const ALUNO = {
  menu: ['Provas Pendentes', 'Provas Concluídas', 'Minhas Turmas', 'Editar Perfil', 'Ver Calendário', 'Face ID', 'Notificações', 'Sair'],
  funcionalidades: {
    'provas pendentes': {
      titulo: '📝 Provas Pendentes',
      descricao: 'Provas que você ainda precisa realizar',
      onde: 'Acesse o painel do aluno, seção "Provas Pendentes"',
      oQueMostra: [
        '📋 Título e conteúdo da prova',
        '📅 Data limite e horário de realização',
        '❓ Quantidade de questões',
        '📊 Dificuldade',
        '▶️ Botão "Iniciar Prova" para começar'
      ],
      dica: 'Fique atento ao prazo de entrega e horário!'
    },
    'provas concluídas': {
      titulo: '✅ Provas Concluídas',
      descricao: 'Provas que você já realizou',
      onde: 'Acesse o painel do aluno, seção "Provas Concluídas"',
      oQueMostra: [
        '📋 Título e conteúdo da prova',
        '📅 Data de realização',
        '⭐ Nota obtida (se liberada)',
        '📌 Status: "Aguardando correção", "Concluída" ou "Cancelada"',
        '👁️ Botão "Ver Nota" para detalhes'
      ],
      dica: 'Provas canceladas recebem nota 0.0'
    },
    'face id': {
      titulo: '📸 Face ID',
      descricao: 'Validação facial para maior segurança no sistema',
      onde: 'Clique em "Cadastrar Agora" no banner ou acesse "capturar-face.html"',
      observacao: '⚠️ O cadastro é obrigatório para acessar provas que exigem validação facial',
      dica: 'O cadastro é rápido e garante mais segurança'
    },
    'notificações': {
      titulo: '🔔 Notificações',
      descricao: 'Alertas sobre provas, resultados e cancelamentos',
      onde: 'Clique no ícone de sino (🔔) no cabeçalho da página',
      tipos: ['📝 Provas pendentes', '✅ Correções liberadas', '🚫 Cancelamentos', '💡 Lembretes'],
      dica: 'Mantenha as notificações ativadas para não perder prazos'
    },
    'entrar turma': {
      titulo: '🏫 Entrar em uma Turma',
      descricao: 'Entrar em uma nova turma usando o código',
      onde: 'Clique no botão "Entrar em Turma" no cabeçalho',
      passos: [
        '1️⃣ Clique no botão "Entrar em Turma" no cabeçalho',
        '2️⃣ Digite o código da turma fornecido pelo professor',
        '3️⃣ Clique em "Entrar" e aguarde a confirmação'
      ],
      dica: 'O código da turma é fornecido pelo professor'
    },
    'turmas': {
      titulo: '🏫 Minhas Turmas',
      descricao: 'Turmas que você está matriculado',
      onde: 'Acesse o painel do aluno, seção "Minhas Turmas"',
      oQueMostra: [
        '📋 Nome da turma e disciplina',
        '👨‍🏫 Professor responsável',
        '🔑 Código da turma',
        '👥 Quantidade de alunos',
        '📝 Provas da turma'
      ],
      dica: 'Para entrar em uma nova turma, pegue o código com seu professor'
    },
    'resultados': {
      titulo: '📊 Meus Resultados',
      descricao: 'Visualize seus resultados e notas',
      onde: 'Acesse o painel do aluno, "Provas Concluídas"',
      oQueMostra: [
        '📋 Todas as provas realizadas',
        '⭐ Notas obtidas',
        '📈 Progresso por disciplina',
        '📊 Estatísticas de desempenho'
      ],
      dica: 'Clique em "Ver Nota" para mais detalhes'
    },
    'calendário': {
      titulo: '📅 Calendário de Provas',
      descricao: 'Visualize todas as suas provas em formato de calendário',
      onde: 'Clique em "Ver Calendário" no cabeçalho da página do aluno',
      oQueMostra: [
        '📋 Todas as provas com data e horário',
        '🔴 Provas pendentes destacadas',
        '📅 Cronograma completo de avaliações'
      ],
      dica: 'Use o calendário para se organizar e não perder prazos'
    },
    'editar perfil': {
      titulo: '👤 Editar Perfil',
      descricao: 'Editar seus dados pessoais e preferências',
      onde: 'Clique no botão "Editar Perfil" no cabeçalho da página do aluno',
      oQuePodeMudar: [
        '📸 Foto de perfil (clique no ícone de câmera)',
        '📝 Nome completo',
        '📱 Telefone',
        '📍 Endereço completo',
        '📝 Bio',
        '🔔 Preferências de notificação',
        '🍽️ Perfil alimentar',
        '🍽️ Refeições que participa'
      ],
      dica: 'Mantenha seus dados atualizados para receber comunicações importantes'
    }
  }
};

// ===== PERFIL: PROFESSOR =====
const PROFESSOR = {
  menu: ['Nova Prova', 'Nova Turma', 'Minhas Provas', 'Minhas Turmas', 'Meu Calendário', 'Resultados', 'Editar Perfil', 'Adaptar Documento', 'Sair'],
  funcionalidades: {
    'nova prova': {
      titulo: '📝 Nova Prova',
      descricao: 'Criar uma nova prova com auxílio de IA',
      onde: 'Clique em "Nova Prova" no menu lateral',
      passos: [
        '1️⃣ Preencha o tema da prova',
        '2️⃣ Defina o título',
        '3️⃣ Selecione a turma',
        '4️⃣ Escolha o período letivo (1º, 2º, 3º ou 4º)',
        '5️⃣ Selecione o tipo de prova (simples, ENEM ou adaptada)',
        '6️⃣ Defina a quantidade de questões (5, 10, 15 ou 20)',
        '7️⃣ Escolha a dificuldade (Fácil, Médio ou Difícil)',
        '8️⃣ Defina data limite e horários',
        '9️⃣ Clique em "Gerar Prova com IA"'
      ],
      tipos: [
        '📄 Simples: 5 alternativas por questão',
        '🎯 ENEM: com texto base e 5 alternativas',
        '♿ Adaptada: 3 alternativas para alunos com acessibilidade'
      ],
      dica: 'Você pode editar as questões antes de publicar'
    },
    'nova turma': {
      titulo: '🏫 Nova Turma',
      descricao: 'Criar uma nova turma para organizar seus alunos',
      onde: 'Clique em "Nova Turma" no menu lateral',
      passos: [
        '1️⃣ Preencha o nome da turma',
        '2️⃣ Defina a disciplina',
        '3️⃣ Selecione o eixo',
        '4️⃣ Adicione uma descrição (opcional)',
        '5️⃣ Clique em "Criar Turma"'
      ],
      oQueGera: '🔑 Código único da turma para compartilhar com os alunos',
      dica: 'Use códigos das turmas para organizar seus alunos'
    },
    'minhas provas': {
      titulo: '📚 Minhas Provas',
      descricao: 'Gerencie todas as suas provas',
      onde: 'Acesse "Minhas Provas" no menu lateral',
      oQueMostra: [
        '📋 Todas as provas criadas',
        '📌 Status: Ativa, Concluída, Rascunho ou Cancelada',
        '👥 Quantidade de alunos que realizaram',
        '📊 Média da turma',
        '🔧 Botões: Visualizar, Editar, Resultados, Liberar Notas, Excluir'
      ],
      filtros: [
        '📌 Por Status',
        '📊 Por Dificuldade',
        '📝 Por Tipo',
        '📅 Por Período',
        '🏫 Por Turma'
      ],
      dica: 'Use os filtros para encontrar provas específicas rapidamente'
    },
    'resultados': {
      titulo: '📊 Resultados',
      descricao: 'Visualize resultados e desempenho dos alunos',
      onde: 'Acesse "Resultados" no menu lateral',
      oQueMostra: [
        '📊 Resultados por turma',
        '👤 Resultados por aluno',
        '📚 Resultados por disciplina',
        '📈 Médias gerais',
        '✅ Taxa de aprovação'
      ],
      oQuePodeFazer: [
        '📄 Exportar relatórios em PDF',
        '📊 Exportar relatórios em Excel',
        '🔓 Liberar notas para os alunos',
        '👁️ Ver detalhes de cada prova',
        '📈 Ver estatísticas detalhadas'
      ],
      dica: 'Use os filtros para encontrar resultados específicos'
    },
    'gerenciar turmas': {
      titulo: '👨‍🏫 Gerenciar Turmas',
      descricao: 'Gerenciar suas turmas e alunos',
      onde: 'Acesse "Minhas Turmas" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver todas as suas turmas',
        '➕ Criar novas turmas',
        '➕ Adicionar alunos à turma',
        '➖ Remover alunos da turma',
        '📊 Ver estatísticas da turma',
        '📝 Criar provas para a turma',
        '📋 Ver detalhes de cada turma',
        '🔑 Compartilhar código da turma'
      ],
      dica: 'Use os códigos das turmas para organizar seus alunos'
    },
    'corrigir prova': {
      titulo: '✏️ Corrigir Prova',
      descricao: 'Corrigir provas e liberar notas para os alunos',
      onde: 'Acesse "Minhas Provas", selecione a prova e clique em "Prova Corrigida"',
      passos: [
        '1️⃣ Selecione a prova que deseja corrigir',
        '2️⃣ Veja as respostas dos alunos',
        '3️⃣ Analise e calcule a nota',
        '4️⃣ Libere a nota (individual ou em lote)'
      ],
      status: [
        '⏳ Pendente: Aguardando correção',
        '✅ Corrigida: Nota já atribuída',
        '🔓 Liberada: Aluno já pode ver a nota'
      ],
      dica: 'Você pode corrigir provas em lote com "Liberar Notas"'
    },
    'liberar notas': {
      titulo: '🔓 Liberar Notas',
      descricao: 'Liberar notas para os alunos verem',
      onde: 'Acesse "Minhas Provas", selecione a prova e clique em "Liberar Notas"',
      opcoes: [
        '👤 Liberar nota individual para um aluno',
        '👥 Liberar notas em lote para todos os alunos'
      ],
      oQueAcontece: [
        '📧 Aluno recebe notificação',
        '🔔 Aluno vê a nota no painel',
        '📊 Nota aparece nos resultados do aluno'
      ],
      dica: 'Você pode liberar notas automaticamente ou manualmente'
    },
    'editar prova': {
      titulo: '✏️ Editar Prova',
      descricao: 'Editar uma prova existente (apenas rascunhos)',
      onde: 'Acesse "Minhas Provas" e clique em "Editar"',
      oQueEditar: [
        '📝 Título e conteúdo da prova',
        '📅 Data limite e horários',
        '📋 Questões (perguntas, opções, resposta correta, explicação)',
        '📌 Dificuldade',
        '🏫 Turma'
      ],
      dica: 'Provas publicadas não podem ser editadas - crie uma cópia'
    },
    'excluir prova': {
      titulo: '🗑️ Excluir Prova',
      descricao: 'Excluir uma prova permanentemente',
      onde: 'Acesse "Minhas Provas" e clique em "Excluir"',
      alerta: [
        '⚠️ Esta ação não pode ser desfeita',
        '🗑️ Todos os dados da prova serão removidos',
        '📊 Os resultados dos alunos serão perdidos',
        '📋 As questões associadas serão excluídas',
        '🚫 Os alunos não poderão mais acessar esta prova'
      ],
      dica: 'Se não tiver certeza, apenas desative a prova em vez de excluir'
    },
    'meu calendário': {
      titulo: '📅 Meu Calendário',
      descricao: 'Visualize todas as provas e eventos em formato de calendário',
      onde: 'Clique em "Meu Calendário" no menu do professor',
      oQueMostra: [
        '📋 Todas as provas por data',
        '✅ Provas ativas, concluídas e rascunhos',
        '⏰ Prazos importantes',
        '📅 Cronograma completo de avaliações'
      ],
      dica: 'Use o calendário para planejar suas provas com antecedência'
    },
    'editar perfil': {
      titulo: '👤 Editar Perfil',
      descricao: 'Editar seus dados pessoais e preferências',
      onde: 'Clique em "Editar Perfil" no cabeçalho da página do professor',
      oQuePodeMudar: [
        '📸 Foto de perfil (clique no ícone de câmera)',
        '📝 Nome completo',
        '📱 Telefone',
        '📍 Endereço completo',
        '📝 Bio',
        '🔔 Preferências de notificação'
      ],
      dica: 'Mantenha seus dados atualizados para receber comunicações importantes'
    },
    'adaptar documento': {
      titulo: '♿ Adaptar Documento',
      descricao: 'Criar versões acessíveis de documentos para alunos com necessidades especiais',
      onde: 'Clique no botão "Adaptar Documento" no cabeçalho',
      opcoes: [
        '🔍 Fonte ampliada (tamanho personalizável: 12pt a 48pt)',
        '🔠 CAIXA ALTA (converte todo o texto para maiúsculas)',
        '🔤 Texto em negrito',
        '🎨 Alto contraste (fundo escuro com texto claro)',
        '📖 Fonte para dislexia (OpenDyslexic)'
      ],
      formatos: ['📄 PDF', '📝 DOCX', '📃 DOC'],
      dica: 'Processado pelo Google Docs - mantém 100% da formatação original'
    }
  }
};

// ===== PERFIL: ADMIN SIMPLES =====
const ADMIN_SIMPLES = {
  menu: ['Dashboard', 'Usuários', 'Turmas', 'Provas', 'Eixos', 'Cursos', 'Resultados', 'Adaptar Documento'],
  funcionalidades: {
    'dashboard': {
      titulo: '📊 Dashboard',
      descricao: 'Visão geral do sistema com estatísticas',
      onde: 'Acesse o painel do administrador',
      oQueMostra: [
        '📊 Total de usuários',
        '🏫 Total de turmas',
        '📝 Total de provas',
        '📈 Total de resultados',
        '📋 Últimas atividades',
        '👥 Distribuição por perfil'
      ]
    },
    'usuários': {
      titulo: '👥 Gerenciar Usuários',
      descricao: 'Gerenciar todos os usuários do sistema',
      onde: 'Acesse "Usuários" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de usuários com filtros',
        '➕ Criar novos usuários',
        '✏️ Editar usuários',
        '🔑 Resetar senha',
        '✅ Ativar/Inativar usuários',
        '🗑️ Excluir usuários',
        '📱 Ver QR Code do usuário',
        '📊 Gerar relatório do usuário'
      ],
      filtros: ['📌 Por perfil', '🔍 Por nome/email', '📊 Por status'],
      dica: 'Use os filtros para encontrar usuários rapidamente'
    },
    'turmas': {
      titulo: '🏫 Gerenciar Turmas',
      descricao: 'Gerenciar todas as turmas do sistema',
      onde: 'Acesse "Turmas" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de turmas',
        '➕ Criar novas turmas',
        '✏️ Editar turmas',
        '👥 Ver alunos da turma',
        '➕ Adicionar alunos',
        '➖ Remover alunos',
        '✅ Ativar/Inativar turmas',
        '🗑️ Excluir turmas'
      ],
      dica: 'Administre turmas de forma centralizada'
    },
    'provas': {
      titulo: '📝 Gerenciar Provas',
      descricao: 'Gerenciar todas as provas do sistema',
      onde: 'Acesse "Provas" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de provas',
        '✨ Criar prova com IA',
        '✏️ Editar provas',
        '📢 Publicar provas',
        '📅 Adiar provas',
        '📊 Ver resultados',
        '👁️ Visualizar questões',
        '🗑️ Excluir provas'
      ],
      filtros: ['📌 Por status', '📊 Por dificuldade', '📝 Por tipo', '🔍 Por busca'],
      dica: 'Use filtros para encontrar provas específicas'
    },
    'eixos': {
      titulo: '📚 Gerenciar Eixos',
      descricao: 'Gerenciar os eixos tecnológicos',
      onde: 'Acesse "Eixos" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de eixos',
        '➕ Criar novos eixos',
        '✏️ Editar eixos',
        '🎨 Definir cores e ícones',
        '🗑️ Excluir eixos'
      ],
      dica: 'Eixos organizam os cursos do sistema'
    },
    'cursos': {
      titulo: '🎓 Gerenciar Cursos',
      descricao: 'Gerenciar os cursos do sistema',
      onde: 'Acesse "Cursos" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de cursos',
        '➕ Criar novos cursos',
        '✏️ Editar cursos',
        '📚 Gerenciar turmas do curso',
        '🗑️ Excluir cursos'
      ],
      dica: 'Cursos são organizados por eixos'
    },
    'resultados': {
      titulo: '📊 Resultados',
      descricao: 'Visualizar todos os resultados do sistema',
      onde: 'Acesse "Resultados" no menu lateral',
      oQueMostra: [
        '📊 Lista de todos os resultados',
        '👥 Por aluno',
        '📝 Por prova',
        '🏫 Por turma',
        '📈 Estatísticas gerais'
      ],
      oQuePodeFazer: [
        '✏️ Editar notas',
        '✅ Liberar notas',
        '📧 Enviar notificações',
        '📄 Exportar PDF',
        '📊 Exportar CSV'
      ],
      dica: 'Gerencie todos os resultados em um só lugar'
    },
    'adaptar documento': {
      titulo: '♿ Adaptar Documento',
      descricao: 'Criar versões acessíveis de documentos',
      onde: 'Clique no botão "Adaptar Documento" no cabeçalho',
      opcoes: [
        '🔍 Fonte ampliada (tamanho personalizável: 12pt a 48pt)',
        '🔠 CAIXA ALTA (converte todo o texto para maiúsculas)',
        '🔤 Texto em negrito',
        '🎨 Alto contraste (fundo escuro com texto claro)',
        '📖 Fonte para dislexia (OpenDyslexic)'
      ],
      formatos: ['📄 PDF', '📝 DOCX', '📃 DOC'],
      dica: 'Processado pelo Google Docs - mantém 100% da formatação original'
    }
  }
};

// ===== PERFIL: SUPER ADMIN =====
const SUPER_ADMIN = {
  menu: ['Dashboard', 'Usuários', 'Turmas', 'Provas', 'Monitoramento', 'Resultados', 'Eixos', 'Cursos', 'Backups', 'Configurações', 'Adaptar Documento'],
  funcionalidades: {
    'dashboard': {
      titulo: '📊 Dashboard Super Admin',
      descricao: 'Visão geral completa do sistema com estatísticas avançadas',
      onde: 'Acesse o painel do Super Admin',
      oQueMostra: [
        '📊 Total de usuários (alunos, professores, admins)',
        '🏫 Total de turmas e cursos',
        '📝 Total de provas criadas',
        '📈 Resultados e estatísticas',
        '🔴 Alertas e violações',
        '📋 Últimas atividades do sistema'
      ]
    },
    'usuários': {
      titulo: '👥 Gerenciar Usuários',
      descricao: 'Gerenciar todos os usuários do sistema com controle total',
      onde: 'Acesse "Usuários" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de usuários com filtros',
        '➕ Criar novos usuários (todos os perfis)',
        '✏️ Editar usuários',
        '🔑 Resetar senha',
        '✅ Ativar/Inativar usuários',
        '🗑️ Excluir usuários permanentemente',
        '📱 Ver QR Code do usuário',
        '📊 Gerar relatório completo do usuário'
      ],
      filtros: ['📌 Por perfil', '🔍 Por nome/email/matrícula', '📊 Por status'],
      dica: 'Controle total sobre todos os usuários do sistema'
    },
    'turmas': {
      titulo: '🏫 Gerenciar Turmas',
      descricao: 'Gerenciar todas as turmas do sistema',
      onde: 'Acesse "Turmas" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de turmas',
        '➕ Criar novas turmas',
        '✏️ Editar turmas',
        '👥 Ver alunos da turma',
        '➕ Adicionar/Remover alunos',
        '✅ Ativar/Inativar turmas',
        '🗑️ Excluir turmas (com todas as provas associadas)'
      ]
    },
    'provas': {
      titulo: '📝 Gerenciar Provas',
      descricao: 'Gerenciar todas as provas do sistema',
      onde: 'Acesse "Provas" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de provas',
        '✨ Criar prova com IA',
        '✏️ Editar provas',
        '📢 Publicar provas',
        '📅 Adiar provas',
        '📊 Ver resultados',
        '👁️ Visualizar questões',
        '🗑️ Excluir provas'
      ]
    },
    'monitoramento': {
      titulo: '🖥️ Monitoramento',
      descricao: 'Monitorar atividades suspeitas e violações no sistema',
      onde: 'Acesse "Monitoramento" no menu lateral',
      oQueMostra: [
        '🔴 Alertas de violação',
        '📊 Logs de atividades',
        '👥 Usuários monitorados',
        '📈 Estatísticas de uso'
      ]
    },
    'resultados': {
      titulo: '📊 Resultados',
      descricao: 'Visualizar e gerenciar todos os resultados do sistema',
      onde: 'Acesse "Resultados" no menu lateral',
      oQuePodeFazer: [
        '📊 Ver resultados por turma, prova e aluno',
        '✏️ Editar notas manualmente',
        '✅ Liberar notas em lote',
        '📧 Enviar notificações',
        '📄 Exportar PDF',
        '📊 Exportar CSV'
      ]
    },
    'eixos': {
      titulo: '📚 Gerenciar Eixos',
      descricao: 'Gerenciar os eixos tecnológicos do sistema',
      onde: 'Acesse "Eixos" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de eixos',
        '➕ Criar novos eixos',
        '✏️ Editar eixos',
        '🎨 Definir cores e ícones',
        '🗑️ Excluir eixos'
      ]
    },
    'cursos': {
      titulo: '🎓 Gerenciar Cursos',
      descricao: 'Gerenciar os cursos do sistema',
      onde: 'Acesse "Cursos" no menu lateral',
      oQuePodeFazer: [
        '👁️ Ver lista de cursos',
        '➕ Criar novos cursos',
        '✏️ Editar cursos',
        '📚 Gerenciar turmas do curso',
        '🗑️ Excluir cursos'
      ]
    },
    'backups': {
      titulo: '💾 Backups',
      descricao: 'Gerenciar backups do sistema',
      onde: 'Acesse "Backups" no menu lateral',
      oQuePodeFazer: [
        '📋 Ver histórico de backups (data, tamanho)',
        '➕ Criar novo backup manual',
        '📥 Baixar backup em .gz',
        '🗑️ Excluir backup antigo'
      ]
    },
    'configurações': {
      titulo: '⚙️ Configurações',
      descricao: 'Configurações gerais do sistema',
      onde: 'Acesse "Configurações" no menu lateral',
      oQuePodeFazer: [
        '🔔 Gerenciar notificações push global',
        '👤 Gerenciar permissões de perfis',
        '🎨 Personalizar interface (cores, tema)',
        '📧 Configurar email (teste de envio)',
        '🔐 Configurar políticas de senha',
        '📊 Configurar provas (tempo, questões, correção)'
      ]
    },
    'adaptar documento': {
      titulo: '♿ Adaptar Documento',
      descricao: 'Criar versões acessíveis de documentos para qualquer usuário',
      onde: 'Clique no botão "Adaptar Documento" no cabeçalho',
      opcoes: [
        '🔍 Fonte ampliada (tamanho personalizável: 12pt a 48pt)',
        '🔠 CAIXA ALTA (converte todo o texto para maiúsculas)',
        '🔤 Texto em negrito',
        '🎨 Alto contraste (fundo escuro com texto claro)',
        '📖 Fonte para dislexia (OpenDyslexic)'
      ],
      formatos: ['📄 PDF', '📝 DOCX', '📃 DOC'],
      dica: 'Processado pelo Google Docs - mantém 100% da formatação original'
    }
  }
};

// ===== PERFIL: SETOR PEDAGÓGICO =====
const SETOR_PEDAGOGICO = {
  menu: ['Dashboard', 'Alunos com Acessibilidade', 'Provas Adaptadas', 'Relatórios', 'Adaptar Documento'],
  funcionalidades: {
    'dashboard': {
      titulo: '📊 Dashboard do Setor Pedagógico',
      descricao: 'Visão geral dos alunos com necessidades especiais',
      onde: 'Acesse o painel do Setor Pedagógico',
      oQueMostra: [
        '👥 Total de alunos com acessibilidade',
        '📊 Distribuição por condição',
        '📝 Provas adaptadas disponíveis',
        '📈 Progresso dos alunos'
      ]
    },
    'alunos com acessibilidade': {
      titulo: '👥 Alunos com Acessibilidade (AEE)',
      descricao: 'Gerenciar alunos com necessidades especiais',
      onde: 'Acesse "Alunos com Acessibilidade" no menu',
      oQueMostra: [
        '📋 Lista de alunos com condições',
        '📋 Tipo de condição',
        '📅 Data da solicitação',
        '📝 Status da solicitação'
      ],
      oQuePodeFazer: [
        '👁️ Ver detalhes do aluno',
        '✅ Aprovar solicitações',
        '📝 Registrar acompanhamento'
      ]
    },
    'provas adaptadas': {
      titulo: '📝 Provas Adaptadas',
      descricao: 'Gerenciar provas adaptadas para alunos com necessidades especiais',
      onde: 'Acesse "Provas Adaptadas" no menu',
      oQueMostra: [
        '📋 Lista de provas adaptadas (3 alternativas)',
        '📋 Turma e professor responsável',
        '📅 Data de criação',
        '👥 Alunos atendidos'
      ],
      oQuePodeFazer: [
        '👁️ Visualizar prova adaptada',
        '🖨️ Imprimir prova adaptada',
        '📊 Ver desempenho dos alunos'
      ],
      dica: 'Provas adaptadas têm 3 alternativas e linguagem acessível'
    },
    'relatórios': {
      titulo: '📊 Relatórios Pedagógicos',
      descricao: 'Gerar relatórios de acessibilidade e inclusão',
      onde: 'Acesse "Relatórios" no menu',
      oQuePodeFazer: [
        '📄 Relatório por turma',
        '📊 Relatório por condição',
        '📈 Relatório de progresso',
        '📊 Estatísticas de inclusão'
      ],
      dica: 'Use os relatórios para acompanhar a eficácia das adaptações'
    },
    'adaptar documento': {
      titulo: '♿ Adaptar Documento - Setor Pedagógico',
      descricao: 'Criar versões acessíveis de documentos para alunos com necessidades especiais',
      onde: 'Clique no botão "Adaptar Documento" no cabeçalho',
      opcoes: [
        '🔍 Fonte ampliada (tamanho personalizável: 12pt a 48pt)',
        '🔠 CAIXA ALTA (converte todo o texto para maiúsculas)',
        '🔤 Texto em negrito',
        '🎨 Alto contraste (fundo escuro com texto claro)',
        '📖 Fonte para dislexia (OpenDyslexic)'
      ],
      formatos: ['📄 PDF', '📝 DOCX', '📃 DOC'],
      dica: 'Processado pelo Google Docs - mantém 100% da formatação original'
    }
  }
};

// ===== PERFIL: COORDENAÇÃO DE PÁTIO =====
const COORDENACAO_PATIO = {
  menu: ['Dashboard', 'Registrar Refeição', 'Alunos', 'Turmas', 'Relatórios'],
  funcionalidades: {
    'dashboard': {
      titulo: '🏃 Dashboard - Coordenação de Pátio',
      descricao: 'Visão geral das refeições do dia',
      onde: 'Acesse o painel da Coordenação de Pátio',
      oQueMostra: [
        '🍽️ Refeições registradas hoje (manhã, almoço, tarde)',
        '👥 Alunos que já comeram',
        '📊 Distribuição por turma',
        '⏰ Horário das refeições (8h-10h, 11h-13h, 14h-16h)',
        '📈 Total de refeições hoje'
      ]
    },
    'registrar refeição': {
      titulo: '🍽️ Registrar Refeição',
      descricao: 'Registrar refeição de um aluno via QR Code automático ou manual',
      onde: 'Acesse "Registrar Refeição" no menu',
      modos: [
        '📱 Automático (QR Code) - Escaneie o QR Code do aluno',
        '👤 Manual - Selecione o aluno por turma'
      ],
      passos: [
        '1️⃣ Busque o aluno pelo nome ou QR Code',
        '2️⃣ Verifique o perfil alimentar do aluno',
        '3️⃣ Selecione o tipo de refeição (Manhã, Almoço, Tarde)',
        '4️⃣ Confirme o registro'
      ],
      dica: 'Verifique se o aluno pode comer a refeição selecionada'
    },
    'alunos': {
      titulo: '👥 Alunos',
      descricao: 'Visualizar todos os alunos com seus perfis alimentares',
      onde: 'Acesse "Alunos" no menu',
      oQueMostra: [
        '📋 Lista completa de alunos',
        '🍽️ Perfil alimentar (Sempre, Às vezes, Nunca)',
        '📅 Refeições do dia',
        '🏫 Turma do aluno'
      ]
    },
    'turmas': {
      titulo: '🏫 Turmas',
      descricao: 'Visualizar turmas e seus alunos com perfis alimentares',
      onde: 'Acesse "Turmas" no menu',
      oQueMostra: [
        '📋 Lista de turmas',
        '👥 Alunos por turma',
        '🍽️ Perfis alimentares por turma',
        '📊 Estatísticas de refeições'
      ]
    },
    'relatórios': {
      titulo: '📊 Relatórios de Refeições',
      descricao: 'Gerar relatórios de refeições',
      onde: 'Acesse "Relatórios" no menu',
      oQuePodeFazer: [
        '📄 Relatório por turma',
        '📊 Relatório por tipo de refeição',
        '📈 Relatório diário',
        '📈 Relatório mensal'
      ]
    }
  }
};

// ===== PERFIL: COZINHA =====
const COZINHA = {
  menu: ['Dashboard', 'Planejar Refeições', 'Monitorar', 'Estoque', 'Relatórios', 'Feedback Alunos'],
  funcionalidades: {
    'dashboard': {
      titulo: '🍳 Dashboard - Cozinha',
      descricao: 'Visão geral da produção de refeições',
      onde: 'Acesse o painel da Cozinha',
      oQueMostra: [
        '🍽️ Refeições do dia (manhã, almoço, tarde)',
        '👥 Total de pessoas e quem comeu hoje',
        '📊 Taxa de adesão (quem disse vs quem veio)',
        '📊 Quantidade de comida prevista em kg',
        '⏰ Horários das refeições',
        '📈 Estatísticas de produção'
      ],
      dica: 'Acompanhe a produção em tempo real'
    },
    'planejar refeições': {
      titulo: '📋 Planejar Refeições',
      descricao: 'Planejar o cardápio e quantidades',
      onde: 'Acesse "Planejar Refeições" no menu',
      oQueFaz: [
        '📝 Definir cardápio do dia',
        '📊 Calcular quantidades por refeição (kg)',
        '👥 Prever número de refeições por turma',
        '📅 Planejamento semanal',
        '📊 Previsão de comida necessária'
      ],
      dica: 'Baseie-se na previsão de alunos para não faltar comida'
    },
    'monitorar': {
      titulo: '📊 Monitorar Produção',
      descricao: 'Monitorar a produção em tempo real',
      onde: 'Acesse "Monitorar" no menu',
      oQueMostra: [
        '📊 Refeições produzidas vs previstas',
        '👥 Alunos atendidos por horário',
        '⏰ Horários de pico',
        '📈 Estatísticas de consumo',
        '📊 Insights e recomendações'
      ],
      dica: 'Acompanhe a produção para ajustes em tempo real'
    },
    'estoque': {
      titulo: '📦 Estoque de Alimentos',
      descricao: 'Gerenciar estoque de alimentos',
      onde: 'Acesse "Estoque" no menu',
      oQuePodeFazer: [
        '📋 Ver estoque atual',
        '➕ Adicionar itens',
        '📊 Controle de validade',
        '📈 Relatórios de consumo',
        '⚠️ Alertas de estoque baixo'
      ],
      dica: 'Mantenha o estoque controlado para evitar faltas'
    },
    'relatórios': {
      titulo: '📊 Relatórios da Cozinha',
      descricao: 'Gerar relatórios da cozinha',
      onde: 'Acesse "Relatórios" no menu',
      oQuePodeFazer: [
        '📄 Relatório de produção (PDF)',
        '📊 Relatório de consumo (CSV)',
        '📈 Relatório de desperdício',
        '📊 Relatório mensal'
      ],
      dica: 'Exporte relatórios para análise de dados'
    },
    'feedback alunos': {
      titulo: '⭐ Feedback dos Alunos',
      descricao: 'Visualizar avaliações dos alunos sobre as refeições',
      onde: 'Acesse a seção "Avaliações dos Alunos" no dashboard',
      oQueMostra: [
        '⭐ Média de notas das refeições',
        '📊 Distribuição das avaliações (1 a 5 estrelas)',
        '💬 Comentários dos alunos',
        '👍 Taxa de aprovação',
        '📈 Tendências de satisfação'
      ],
      filtros: ['📅 Por período', '🍽️ Por tipo de refeição', '⭐ Por nota'],
      dica: 'Use os filtros para entender melhor a satisfação dos alunos'
    }
  }
};

// ===== PERFIL: GESTÃO GERAL =====
const GESTAO_GERAL = {
  menu: ['Dashboard', 'Rodízio de Refeições', 'Turmas', 'Relatórios'],
  funcionalidades: {
    'dashboard': {
      titulo: '📊 Dashboard - Gestão Geral',
      descricao: 'Visão geral do rodízio de refeições',
      onde: 'Acesse o painel da Gestão Geral',
      oQueMostra: [
        '📊 Total de rodízios configurados',
        '📊 Rodízios ativos e inativos',
        '👥 Turmas com rodízio ativo',
        '👥 Alunos por turma',
        '🍽️ Horários das refeições',
        '📋 Turmas sem rodízio'
      ]
    },
    'rodízio de refeições': {
      titulo: '🔄 Rodízio de Refeições',
      descricao: 'Gerenciar o rodízio de refeições por turma',
      onde: 'Acesse "Rodízio de Refeições" no menu',
      oQuePodeFazer: [
        '📋 Ver rodízio atual',
        '📝 Criar/Editar rodízio para uma turma',
        '👥 Atribuir turmas ao rodízio',
        '⏰ Definir horários por turma',
        '📅 Planejamento mensal'
      ],
      tipos: ['📅 Semanal (dias da semana)', '📆 Mensal (dias do mês)', '🔄 Ambos'],
      dica: 'Distribua as turmas de forma equilibrada ao longo da semana'
    },
    'turmas': {
      titulo: '🏫 Turmas e Rodízio',
      descricao: 'Visualizar turmas e rodízio atribuído',
      onde: 'Acesse "Turmas" no menu',
      oQueMostra: [
        '📋 Lista de turmas',
        '🔄 Rodízio atribuído (tipo, dias, horários)',
        '👥 Quantidade de alunos',
        '📊 Estatísticas por turma',
        '📅 Calendário do rodízio'
      ]
    },
    'relatórios': {
      titulo: '📊 Relatórios do Rodízio',
      descricao: 'Gerar relatórios do rodízio de refeições',
      onde: 'Acesse "Relatórios" no menu',
      oQuePodeFazer: [
        '📄 Relatório por turma',
        '📊 Relatório por período',
        '📈 Relatório de participação',
        '📊 Relatório mensal'
      ]
    }
  }
};

// ===== PERFIL: ENFERMARIA =====
const ENFERMARIA = {
  menu: ['Dashboard', 'Atendimentos', 'Alunos', 'Relatórios'],
  funcionalidades: {
    'dashboard': {
      titulo: '🏥 Dashboard - Enfermaria',
      descricao: 'Visão geral dos atendimentos',
      onde: 'Acesse o painel da Enfermaria',
      oQueMostra: [
        '📊 Atendimentos do dia',
        '📊 Atendimentos da semana',
        '📊 Atendimentos do mês',
        '📊 Total geral de atendimentos',
        '👥 Alunos atendidos',
        '📋 Tipo de queixas mais comuns',
        '📈 Estatísticas por período',
        '⏰ Distribuição por horário'
      ]
    },
    'atendimentos': {
      titulo: '📋 Atendimentos',
      descricao: 'Registrar e gerenciar atendimentos de alunos',
      onde: 'Acesse "Atendimentos" no menu',
      oQuePodeFazer: [
        '➕ Registrar novo atendimento (entrada)',
        '📋 Ver histórico do aluno',
        '📝 Registrar queixas e sintomas',
        '💊 Registrar medicamentos administrados',
        '📊 Ver estatísticas de atendimentos'
      ],
      passos: [
        '1️⃣ Escaneie o QR Code do aluno',
        '2️⃣ Verifique se o aluno já está em atendimento',
        '3️⃣ Registre a queixa e observações',
        '4️⃣ Ao finalizar, registre o desfecho'
      ],
      desfechos: [
        '🔄 Retornou para Sala de Aula',
        '📋 Encaminhado para Gestão Geral',
        '👨‍👩‍👦 Liberado com o Responsável',
        '👨‍🏫 Liberado com o Coordenador de Pátio',
        '📝 Outros'
      ]
    },
    'alunos': {
      titulo: '👥 Alunos - Enfermaria',
      descricao: 'Visualizar alunos e histórico médico',
      onde: 'Acesse "Alunos" no menu',
      oQueMostra: [
        '📋 Lista de alunos',
        '🏥 Histórico de atendimentos',
        '💊 Medicamentos registrados',
        '📋 Observações médicas',
        '📊 Alunos com maior frequência'
      ]
    },
    'relatórios': {
      titulo: '📊 Relatórios da Enfermaria',
      descricao: 'Gerar relatórios da enfermaria',
      onde: 'Acesse "Relatórios" no menu',
      oQuePodeFazer: [
        '📄 Relatório por período',
        '📊 Relatório por tipo de queixa',
        '📈 Relatório de atendimentos',
        '📊 Estatísticas mensais'
      ]
    }
  }
};

// ============================================
// MAPEAMENTO DE PERFIS
// ============================================
const PERFIS = {
  'login': LOGIN,
  'aluno': ALUNO,
  'professor': PROFESSOR,
  'adminSimples': ADMIN_SIMPLES,
  'superAdmin': SUPER_ADMIN,
  'setorPedagogico': SETOR_PEDAGOGICO,
  'coordenacaoPatio': COORDENACAO_PATIO,
  'cozinha': COZINHA,
  'gestaoGeral': GESTAO_GERAL,
  'enfermaria': ENFERMARIA
};

// ============================================
// CLASSE PRINCIPAL
// ============================================
class ChatbotBackend {
  constructor() {
    const apiKey = process.env.CHATBOT_API_KEY || process.env.GROQ_API_KEY;
    
    this.inicializado = false;
    this.status = 'initializing';
    this.model = 'qwen/qwen3.6-27b';
    this.maxTokens = 500;
    this.temperature = 0.7;
    this.modelosDisponiveis = Object.values(MODELOS_GROQ);
    
    if (!apiKey) {
      console.warn('⚠️ Chatbot: Modo fallback (sem IA)');
      this.groq = null;
      this.inicializado = false;
      this.status = 'disabled';
      return;
    }
    
    try {
      this.groq = new Groq({ apiKey });
      this.inicializado = true;
      this.status = 'ready';
      console.log('✅ Chatbot: Configurado com Groq');
    } catch (error) {
      console.error('❌ Chatbot: Erro ao inicializar Groq:', error.message);
      this.groq = null;
      this.inicializado = false;
      this.status = 'error';
    }
  }

  // ============================================
  // DETECTAR PERFIL
  // ============================================
  detectarPerfil(route, perfilDoFrontend) {
    if (perfilDoFrontend && perfilDoFrontend !== 'padrao') return perfilDoFrontend;
    if (!route) return 'padrao';
    const r = route.toLowerCase();
    
    if (r.includes('/login') || r.includes('/login.html') || r.includes('/register') || r.includes('/cadastro')) return 'login';
    if (r.includes('/aluno') || r.includes('/aluno.html') || r.includes('aluno')) return 'aluno';
    if (r.includes('/index.html') || r.includes('/professor') || r.includes('/dashboard') || r.includes('/admin') && !r.includes('admin-simples') && !r.includes('admin.html')) return 'professor';
    if (r.includes('/admin-simples') || r.includes('/admin-simples.html')) return 'adminSimples';
    if (r.includes('/admin.html') || r.includes('/super-admin')) return 'superAdmin';
    if (r.includes('/setor-pedagogico') || r.includes('/setor-pedagogico.html')) return 'setorPedagogico';
    if (r.includes('/coordenacao-patio') || r.includes('/coordenacao-patio.html')) return 'coordenacaoPatio';
    if (r.includes('/cozinha') || r.includes('/cozinha.html') || r.includes('/cozinha-dashboard')) return 'cozinha';
    if (r.includes('/gestao-geral') || r.includes('/gestao-geral.html')) return 'gestaoGeral';
    if (r.includes('/enfermaria') || r.includes('/enfermaria.html')) return 'enfermaria';
    
    return 'padrao';
  }

  // ============================================
  // DETECTAR INTENÇÃO - COMPLETO
  // ============================================
  detectarIntencao(pergunta, perfil) {
    const msg = pergunta.toLowerCase().trim();

    // CONTATO - PRIORIDADE MÁXIMA
    const palavrasContato = ['contato', 'suporte', 'ajuda', 'email', 'telefone', 'whatsapp', 'falar com', 'entrar em contato', 'falar com suporte', 'preciso de ajuda', 'como faço para', 'como posso', 'tenho dúvidas', 'dúvida', 'problema', 'problemas', 'reportar', 'reclamar', 'sugestão', 'feedback'];
    for (const palavra of palavrasContato) {
      if (msg.includes(palavra)) return 'contato';
    }

    // ============================================
    // DETECÇÃO POR PERFIL
    // ============================================
    
    // ----- COZINHA -----
    if (perfil === 'cozinha') {
      if (msg.includes('dashboard') || msg.includes('painel') || msg.includes('visão geral') || msg.includes('estatísticas') || msg.includes('totais')) return 'dashboard';
      if (msg.includes('planejar refeições') || msg.includes('planejar refeicoes') || msg.includes('cardápio') || msg.includes('cardapio') || msg.includes('planejar comida') || msg.includes('planejamento') || msg.includes('cardápio da semana') || msg.includes('planejar almoço') || msg.includes('previsão de refeições') || msg.includes('quantas pessoas vão comer') || msg.includes('previsão de comida')) return 'planejar refeições';
      if (msg.includes('monitorar') || msg.includes('produção') || msg.includes('produzir') || msg.includes('cozinhar') || msg.includes('monitorar produção') || msg.includes('produção em tempo real') || msg.includes('quantas refeições foram feitas') || msg.includes('refeições produzidas') || msg.includes('alunos atendidos') || msg.includes('horários de pico')) return 'monitorar';
      if (msg.includes('estoque') || msg.includes('ingredientes') || msg.includes('alimentos') || msg.includes('suprimentos') || msg.includes('estoque de comida') || msg.includes('ver estoque') || msg.includes('adicionar item') || msg.includes('controle de validade') || msg.includes('relatório de consumo') || msg.includes('estoque baixo') || msg.includes('falta ingrediente')) return 'estoque';
      if (msg.includes('relatório') || msg.includes('relatorios') || msg.includes('exportar') || msg.includes('pdf') || msg.includes('csv') || msg.includes('gerar relatório') || msg.includes('relatório de produção') || msg.includes('relatório de consumo') || msg.includes('relatório de desperdício') || msg.includes('baixar relatório')) return 'relatórios';
      if (msg.includes('feedback') || msg.includes('avaliação') || msg.includes('avaliacao') || msg.includes('avaliacoes') || msg.includes('alunos avaliaram') || msg.includes('nota refeição') || msg.includes('avaliação dos alunos') || msg.includes('feedback dos alunos') || msg.includes('satisfação') || msg.includes('comentários dos alunos') || msg.includes('o que os alunos acharam') || msg.includes('estrelas')) return 'feedback alunos';
      if (msg.includes('cozinha') || msg.includes('refeição') || msg.includes('comida') || msg.includes('alimentação')) return 'menu_cozinha';
    }

    // ----- SETOR PEDAGÓGICO -----
    if (perfil === 'setorPedagogico') {
      if (msg.includes('dashboard') || msg.includes('painel') || msg.includes('visão geral')) return 'dashboard';
      if (msg.includes('acessibilidade') || msg.includes('alunos com acessibilidade') || msg.includes('necessidades especiais') || msg.includes('aee') || msg.includes('inclusão')) return 'alunos com acessibilidade';
      if (msg.includes('provas adaptadas') || msg.includes('adaptadas') || msg.includes('prova adaptada')) return 'provas adaptadas';
      if (msg.includes('relatórios pedagógicos') || msg.includes('relatório pedagógico') || msg.includes('relatório de acessibilidade')) return 'relatórios';
      if (msg.includes('adaptar documento') || msg.includes('adaptar')) return 'adaptar documento';
    }

    // ----- COORDENAÇÃO DE PÁTIO -----
    if (perfil === 'coordenacaoPatio') {
      if (msg.includes('dashboard') || msg.includes('painel') || msg.includes('visão geral')) return 'dashboard';
      if (msg.includes('registrar refeição') || msg.includes('refeição') || msg.includes('comer') || msg.includes('almoço') || msg.includes('café') || msg.includes('jantar') || msg.includes('registrar comida') || msg.includes('refeições')) return 'registrar refeição';
      if (msg.includes('alunos') || msg.includes('listar alunos')) return 'alunos';
      if (msg.includes('turmas') || msg.includes('listar turmas')) return 'turmas';
      if (msg.includes('relatórios') || msg.includes('relatório de refeições')) return 'relatórios';
    }

    // ----- GESTÃO GERAL -----
    if (perfil === 'gestaoGeral') {
      if (msg.includes('dashboard') || msg.includes('painel')) return 'dashboard';
      if (msg.includes('rodízio') || msg.includes('rodizio') || msg.includes('rodízio de refeições') || msg.includes('escala')) return 'rodízio de refeições';
      if (msg.includes('turmas')) return 'turmas';
      if (msg.includes('relatórios')) return 'relatórios';
    }

    // ----- ENFERMARIA -----
    if (perfil === 'enfermaria') {
      if (msg.includes('dashboard') || msg.includes('painel')) return 'dashboard';
      if (msg.includes('atendimento') || msg.includes('atendimentos') || msg.includes('enfermaria') || msg.includes('saúde') || msg.includes('queixa') || msg.includes('registrar atendimento')) return 'atendimentos';
      if (msg.includes('alunos') || msg.includes('histórico médico')) return 'alunos';
      if (msg.includes('relatórios')) return 'relatórios';
    }

    // ----- PROFESSOR -----
    if (perfil === 'professor') {
      if (msg.includes('nova prova') || msg.includes('criar prova') || msg.includes('gerar prova') || msg.includes('prova com ia')) return 'nova prova';
      if (msg.includes('nova turma') || msg.includes('criar turma')) return 'nova turma';
      if (msg.includes('minhas provas') || msg.includes('listar provas') || msg.includes('ver provas')) return 'minhas provas';
      if (msg.includes('resultado') || msg.includes('resultados') || msg.includes('desempenho') || msg.includes('notas')) return 'resultados';
      if (msg.includes('gerenciar turma') || msg.includes('gerenciar turmas')) return 'gerenciar turmas';
      if (msg.includes('corrigir') || msg.includes('correção') || msg.includes('corrigir prova')) return 'corrigir prova';
      if (msg.includes('liberar notas') || msg.includes('liberar nota')) return 'liberar notas';
      if (msg.includes('editar prova')) return 'editar prova';
      if (msg.includes('excluir prova') || msg.includes('deletar prova')) return 'excluir prova';
      if (msg.includes('calendário') || msg.includes('calendario') || msg.includes('agenda')) return 'meu calendário';
      if (msg.includes('editar perfil') || msg.includes('mudar dados')) return 'editar perfil';
      if (msg.includes('adaptar documento')) return 'adaptar documento';
    }

    // ----- ALUNO -----
    if (perfil === 'aluno') {
      if (msg.includes('provas pendentes') || msg.includes('pendentes') || msg.includes('provas para fazer')) return 'provas pendentes';
      if (msg.includes('provas concluídas') || msg.includes('concluídas') || msg.includes('provas feitas')) return 'provas concluídas';
      if (msg.includes('face') || msg.includes('face id') || msg.includes('cadastrar face')) return 'face id';
      if (msg.includes('notificação') || msg.includes('notificações') || msg.includes('sino')) return 'notificações';
      if (msg.includes('entrar em turma') || msg.includes('entrar turma') || msg.includes('código da turma')) return 'entrar turma';
      if (msg.includes('turma') || msg.includes('turmas') || msg.includes('minhas turmas')) return 'turmas';
      if (msg.includes('resultados') || msg.includes('notas') || msg.includes('meu resultado')) return 'resultados';
      if (msg.includes('calendário') || msg.includes('calendario')) return 'calendário';
      if (msg.includes('editar perfil') || msg.includes('mudar dados')) return 'editar perfil';
    }

    // ----- ADMIN -----
    if (perfil === 'adminSimples' || perfil === 'superAdmin') {
      if (msg.includes('dashboard') || msg.includes('painel') || msg.includes('visão geral')) return 'dashboard';
      if (msg.includes('usuários') || msg.includes('usuarios') || msg.includes('gerenciar usuários')) return 'usuários';
      if (msg.includes('turmas')) return 'turmas';
      if (msg.includes('provas')) return 'provas';
      if (msg.includes('eixos')) return 'eixos';
      if (msg.includes('cursos')) return 'cursos';
      if (msg.includes('resultados')) return 'resultados';
      if (msg.includes('monitoramento') || msg.includes('violação') || msg.includes('alertas')) return 'monitoramento';
      if (msg.includes('backup') || msg.includes('backups')) return 'backups';
      if (msg.includes('configurações') || msg.includes('configuracoes')) return 'configurações';
      if (msg.includes('adaptar documento')) return 'adaptar documento';
    }

    // ----- LOGIN -----
    if (perfil === 'login') {
      if (msg.includes('login') || msg.includes('entrar') || msg.includes('acessar')) return 'login';
      if (msg.includes('criar conta') || msg.includes('cadastro') || msg.includes('registrar')) return 'criar conta';
      if (msg.includes('recuperar senha') || msg.includes('esqueci a senha')) return 'recuperar senha';
    }

    return null;
  }

  // ============================================
  // FORMATAR RESPOSTA
  // ============================================
  formatarResposta(dados) {
    if (!dados) return null;
    
    let resposta = `${dados.titulo || 'ℹ️ Informação'}\n\n`;
    if (dados.descricao) resposta += `${dados.descricao}\n\n`;
    
    if (dados.onde) resposta += `📌 Onde acessar:\n${dados.onde}\n\n`;
    if (dados.comoFazer) resposta += `📌 Como fazer:\n${dados.comoFazer}\n\n`;
    
    if (dados.passos && dados.passos.length > 0) {
      resposta += `📋 Passos:\n${dados.passos.join('\n')}\n\n`;
    }
    
    if (dados.oQueMostra && dados.oQueMostra.length > 0) {
      resposta += `📋 O que mostra:\n• ${dados.oQueMostra.join('\n• ')}\n\n`;
    }
    
    if (dados.oQuePodeMudar && dados.oQuePodeMudar.length > 0) {
      resposta += `✏️ O que você pode alterar:\n• ${dados.oQuePodeMudar.join('\n• ')}\n\n`;
    }
    
    if (dados.oQuePodeFazer && dados.oQuePodeFazer.length > 0) {
      resposta += `📋 O que você pode fazer:\n• ${dados.oQuePodeFazer.join('\n• ')}\n\n`;
    }
    
    if (dados.oQueFaz && dados.oQueFaz.length > 0) {
      resposta += `📋 Funcionalidades:\n• ${dados.oQueFaz.join('\n• ')}\n\n`;
    }
    
    if (dados.oQueEditar && dados.oQueEditar.length > 0) {
      resposta += `✏️ O que editar:\n• ${dados.oQueEditar.join('\n• ')}\n\n`;
    }
    
    if (dados.tipos && dados.tipos.length > 0) {
      resposta += `📌 Tipos disponíveis:\n• ${dados.tipos.join('\n• ')}\n\n`;
    }
    
    if (dados.opcoes && dados.opcoes.length > 0) {
      resposta += `📋 Opções disponíveis:\n• ${dados.opcoes.join('\n• ')}\n\n`;
    }
    
    if (dados.modos && dados.modos.length > 0) {
      resposta += `📋 Modos disponíveis:\n• ${dados.modos.join('\n• ')}\n\n`;
    }
    
    if (dados.formatos && dados.formatos.length > 0) {
      resposta += `📌 Formatos suportados:\n${dados.formatos.join(', ')}\n\n`;
    }
    
    if (dados.filtros && dados.filtros.length > 0) {
      resposta += `🔍 Filtros disponíveis:\n• ${dados.filtros.join('\n• ')}\n\n`;
    }
    
    if (dados.status && dados.status.length > 0) {
      resposta += `📌 Status:\n• ${dados.status.join('\n• ')}\n\n`;
    }
    
    if (dados.alerta && dados.alerta.length > 0) {
      resposta += `⚠️ ATENÇÃO:\n• ${dados.alerta.join('\n• ')}\n\n`;
    }
    
    if (dados.desfechos && dados.desfechos.length > 0) {
      resposta += `📋 Desfechos disponíveis:\n• ${dados.desfechos.join('\n• ')}\n\n`;
    }
    
    if (dados.observacao) resposta += `⚠️ ${dados.observacao}\n\n`;
    if (dados.oQueGera) resposta += `🔑 ${dados.oQueGera}\n\n`;
    if (dados.oQueAcontece && dados.oQueAcontece.length > 0) {
      resposta += `📋 O que acontece:\n• ${dados.oQueAcontece.join('\n• ')}\n\n`;
    }
    if (dados.dica) resposta += `💡 ${dados.dica}`;
    
    return resposta;
  }

  // ============================================
  // OBTER RESPOSTA POR INTENÇÃO
  // ============================================
  getRespostaPorIntencao(intencao, perfil) {
    // CONTATO
    if (intencao === 'contato') {
      return `📞 Entre em contato com o suporte:

Email: ${SISTEMA_INFO.emailSuporte}
Telefone: ${SISTEMA_INFO.telefoneSuporte}
Site: ${SISTEMA_INFO.site}

Estamos disponíveis para ajudar com:
• Dúvidas sobre o sistema
• Problemas técnicos
• Dificuldades com login
• Orientações sobre provas
• Sugestões e feedback

Nossa equipe está pronta para atendê-lo! 😊`;
    }

    // ============================================
    // COZINHA - MENU
    // ============================================
    if (intencao === 'menu_cozinha' && perfil === 'cozinha') {
      return `🍳 **Painel da Cozinha - Funcionalidades Disponíveis**

📌 **Menu principal:**
• 📊 Dashboard - Visão geral da produção
• 📋 Planejar Refeições - Cardápio e quantidades
• 📊 Monitorar - Produção em tempo real
• 📦 Estoque - Controle de alimentos
• 📊 Relatórios - Exportar dados (PDF/CSV)
• ⭐ Feedback Alunos - Avaliações das refeições

**O que você gostaria de saber?** 😊
Digite uma pergunta específica sobre qualquer funcionalidade.`;
    }

    // ============================================
    // BUSCAR RESPOSTA NOS PERFIS
    // ============================================
    if (PERFIS[perfil]) {
      const funcs = PERFIS[perfil].funcionalidades;
      if (funcs[intencao]) {
        return this.formatarResposta(funcs[intencao]);
      }
    }

    return null;
  }

  // ============================================
  // RESPOSTA DIRETA
  // ============================================
  getRespostaDireta(pergunta, perfil) {
    const intencao = this.detectarIntencao(pergunta, perfil);
    
    if (intencao) {
      const resposta = this.getRespostaPorIntencao(intencao, perfil);
      if (resposta) {
        return resposta;
      }
    }
    
    const msg = pergunta.toLowerCase().trim();
    
    // RECUPERAÇÃO DE SENHA
    if (msg.includes('senha') || msg.includes('recuperar') || msg.includes('esqueci') || msg.includes('recuperação')) {
      return `🔑 Recuperação de senha:

1. ${SISTEMA_INFO.recuperacaoSenha.passo1}
2. ${SISTEMA_INFO.recuperacaoSenha.passo2}
3. ${SISTEMA_INFO.recuperacaoSenha.passo3}
4. ${SISTEMA_INFO.recuperacaoSenha.passo4}

⚠️ ${SISTEMA_INFO.recuperacaoSenha.observacao}

Se não receber o email, verifique a pasta de spam ou contate o suporte.`;
    }
    
    // PERGUNTAS GENÉRICAS - MOSTRAR MENU DO PERFIL
    if (msg.includes('como') || msg.includes('oque') || msg.includes('o que') || msg.includes('onde') || 
        msg.includes('quando') || msg.includes('sobre') || msg.includes('menu') || msg.includes('ajuda') ||
        msg.includes('funcionalidades') || msg.includes('o que posso fazer') || msg.includes('o que tem') ||
        msg.includes('quais as funcionalidades') || msg.includes('como funciona') || msg.includes('para que serve')) {
      
      if (PERFIS[perfil]) {
        const info = PERFIS[perfil];
        const nomePerfil = {
          'professor': 'Professor',
          'aluno': 'Aluno',
          'adminSimples': 'Administrador',
          'superAdmin': 'Super Administrador',
          'setorPedagogico': 'Setor Pedagógico',
          'coordenacaoPatio': 'Coordenação de Pátio',
          'cozinha': 'Cozinha',
          'gestaoGeral': 'Gestão Geral',
          'enfermaria': 'Enfermaria',
          'login': 'Login'
        }[perfil] || 'Sistema';
        
        return `💡 No painel do **${nomePerfil}** você tem:

📌 **Menu disponível:**
• ${info.menu.join('\n• ')}

**O que você gostaria de saber?** 😊`;
      }
    }
    
    return null;
  }

  // ============================================
  // LIMPAR RESPOSTA
  // ============================================
  limparResposta(resposta) {
    if (!resposta) return null;
    let limpa = resposta.replace(/<think>[\s\S]*?<\/think>/g, '');
    limpa = limpa.replace(/<think>[\s\S]*$/g, '');
    limpa = limpa.replace(/^\s*[\r\n]/gm, '');
    if (!limpa || limpa.trim().length === 0) return null;
    return limpa.trim();
  }

  // ============================================
  // VERIFICAÇÕES
  // ============================================
  isReady() {
    return this.inicializado && this.groq !== null && this.status === 'ready';
  }

  isAvailable() {
    return this.inicializado && this.groq !== null;
  }

  getStatus() {
    return {
      status: this.status,
      inicializado: this.inicializado,
      model: this.model,
      modelosDisponiveis: this.modelosDisponiveis,
      timestamp: new Date().toISOString()
    };
  }

  // ============================================
  // GERAR RESPOSTA
  // ============================================
  async generateResponse(userMessage, perfil, conversationHistory = []) {
    const respostaDireta = this.getRespostaDireta(userMessage, perfil);
    if (respostaDireta) {
      return { sucesso: true, resposta: respostaDireta, modelo: 'direto' };
    }

    if (!this.isAvailable()) {
      return { sucesso: false, resposta: this.getFallbackResponse(perfil), modelo: null };
    }

    try {
      const contextos = {
        aluno: 'Você é um assistente para ALUNOS do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        professor: 'Você é um assistente para PROFESSORES do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        login: 'Você é um assistente para LOGIN do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        adminSimples: 'Você é um assistente para ADMINISTRADORES do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        superAdmin: 'Você é um assistente para SUPER ADMINISTRADORES do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        setorPedagogico: 'Você é um assistente do SETOR PEDAGÓGICO do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        coordenacaoPatio: 'Você é um assistente da COORDENAÇÃO DE PÁTIO do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        cozinha: 'Você é um assistente da COZINHA do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        gestaoGeral: 'Você é um assistente da GESTÃO GERAL do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        enfermaria: 'Você é um assistente da ENFERMARIA do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.',
        padrao: 'Você é um assistente do Sistema de Provas. Responda em português brasileiro. Seja direto e objetivo.'
      };

      const messages = [
        { role: "system", content: contextos[perfil] || contextos.padrao },
        ...conversationHistory.slice(-3).map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        { role: "user", content: userMessage }
      ];

      const completion = await this.groq.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens
      });

      let response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('Resposta vazia');

      response = this.limparResposta(response);
      if (!response) throw new Error('Resposta vazia após limpeza');

      return { sucesso: true, resposta: response, modelo: this.model };

    } catch (error) {
      return { sucesso: false, resposta: this.getFallbackResponse(perfil), modelo: null };
    }
  }

  // ============================================
  // FALLBACK
  // ============================================
  getFallbackResponse(perfil) {
    const nomePerfil = {
      'professor': 'Professor',
      'aluno': 'Aluno',
      'adminSimples': 'Administrador',
      'superAdmin': 'Super Administrador',
      'setorPedagogico': 'Setor Pedagógico',
      'coordenacaoPatio': 'Coordenação de Pátio',
      'cozinha': 'Cozinha',
      'gestaoGeral': 'Gestão Geral',
      'enfermaria': 'Enfermaria',
      'login': 'Login'
    }[perfil] || 'Sistema';

    return `Desculpe, não entendi sua pergunta específica sobre o ${nomePerfil}.

💡 **Tente perguntar de forma mais clara:**

Exemplos para ${nomePerfil}:
${this.getExemplosPerguntas(perfil)}

📞 Se precisar de ajuda, entre em contato com o suporte:
Email: ${SISTEMA_INFO.emailSuporte}
Telefone: ${SISTEMA_INFO.telefoneSuporte}`;
  }

  // ============================================
  // EXEMPLOS DE PERGUNTAS POR PERFIL
  // ============================================
  getExemplosPerguntas(perfil) {
    const exemplos = {
      'cozinha': '• "Como planejar as refeições?"\n• "Qual a produção de hoje?"\n• "Como está o estoque?"\n• "O que os alunos acharam da comida?"\n• "Gerar relatório da cozinha"',
      'setorPedagogico': '• "Listar alunos com acessibilidade"\n• "Ver provas adaptadas"\n• "Gerar relatório pedagógico"\n• "Adaptar documento para aluno"',
      'coordenacaoPatio': '• "Registrar refeição de um aluno"\n• "Ver alunos que comeram hoje"\n• "Listar turmas"\n• "Relatório de refeições"',
      'gestaoGeral': '• "Ver rodízio de refeições"\n• "Criar rodízio para uma turma"\n• "Listar turmas sem rodízio"\n• "Relatório do rodízio"',
      'enfermaria': '• "Registrar atendimento"\n• "Ver alunos atendidos hoje"\n• "Histórico de um aluno"\n• "Relatório da enfermaria"',
      'professor': '• "Como criar uma prova?"\n• "Ver minhas provas"\n• "Corrigir prova"\n• "Liberar notas"\n• "Criar turma"',
      'aluno': '• "Ver provas pendentes"\n• "Ver minhas notas"\n• "Entrar em uma turma"\n• "Cadastrar Face ID"',
      'adminSimples': '• "Gerenciar usuários"\n• "Criar nova turma"\n• "Ver todas as provas"\n• "Gerenciar eixos"',
      'superAdmin': '• "Dashboard do sistema"\n• "Monitorar violações"\n• "Configurar sistema"\n• "Fazer backup"',
      'login': '• "Como faço login?"\n• "Criar uma conta"\n• "Recuperar senha"'
    };
    return exemplos[perfil] || '• "Como funciona o sistema?"\n• "O que posso fazer aqui?"\n• "Preciso de ajuda"';
  }

  // ============================================
  // PROCESSAR MENSAGEM
  // ============================================
  async processMessage(data) {
    const { message, route, conversationHistory = [], context = {} } = data;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('Mensagem inválida');
    }

    const perfilDoFrontend = context?.perfil || null;
    const perfil = this.detectarPerfil(route, perfilDoFrontend);

    
    const result = await this.generateResponse(
      message.trim(),
      perfil,
      conversationHistory || []
    );

    return {
      success: true,
      response: result.resposta,
      modelo: result.modelo,
      perfil: perfil,
      timestamp: new Date().toISOString(),
      status: this.getStatus()
    };
  }

  // ============================================
  // HEALTH CHECK
  // ============================================
  async healthCheck() {
    return {
      status: this.status,
      inicializado: this.inicializado,
      modelo: this.model,
      modelosDisponiveis: this.modelosDisponiveis,
      timestamp: new Date().toISOString()
    };
  }

  getModelosDisponiveis() {
    return this.modelosDisponiveis;
  }
}

module.exports = ChatbotBackend;
module.exports.MODELOS_GROQ = MODELOS_GROQ;
module.exports.SISTEMA_INFO = SISTEMA_INFO;