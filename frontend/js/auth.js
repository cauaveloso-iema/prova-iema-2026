class AuthService {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.user = this.getUserFromStorage();
    this.apiUrl = 'http://localhost:3000/api';
  }

  // Obter usuário do localStorage
  getUserFromStorage() {
    const userStr = localStorage.getItem('user_data');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // Salvar dados de autenticação
  saveAuthData(token, user) {
    this.token = token;
    this.user = user;
    
    // Criptografar antes de salvar no localStorage
    const encryptedUser = this.encryptData(JSON.stringify(user));
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_data', encryptedUser);
    localStorage.setItem('auth_timestamp', Date.now());
  }

  // Criptografia simples para localStorage
  encryptData(data) {
    // Implementação básica - em produção use biblioteca como crypto-js
    return btoa(unescape(encodeURIComponent(data)));
  }

  decryptData(encrypted) {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(encrypted))));
    } catch (e) {
      return null;
    }
  }

  // Verificar se está autenticado
  isAuthenticated() {
    if (!this.token || !this.user) return false;
    
    // Verificar se token expirou (simplificado)
    const timestamp = localStorage.getItem('auth_timestamp');
    if (timestamp) {
      const hoursSinceLogin = (Date.now() - parseInt(timestamp)) / (1000 * 60 * 60);
      if (hoursSinceLogin > 23) { // JWT expira em 24h
        this.logout();
        return false;
      }
    }
    
    return true;
  }

  // Fazer login
  async login(email, password) {
    try {
      const response = await fetch(`${this.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.success) {
        this.saveAuthData(data.token, data.user);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Erro no login:', error);
      return { success: false, error: 'Erro de conexão' };
    }
  }

  // Registrar
  async register(nome, email, password, matricula = '') {
    try {
      const response = await fetch(`${this.apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, password, matricula })
      });

      const data = await response.json();

      if (data.success) {
        this.saveAuthData(data.token, data.user);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Erro no registro:', error);
      return { success: false, error: 'Erro de conexão' };
    }
  }

  // Verificar token (manter sessão)
  async verifyToken() {
    if (!this.token) return { success: false };

    try {
      const response = await fetch(`${this.apiUrl}/auth/verify`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const data = await response.json();

      if (data.success) {
        this.user = data.user;
        const encryptedUser = this.encryptData(JSON.stringify(data.user));
        localStorage.setItem('user_data', encryptedUser);
        return { success: true, user: data.user };
      } else {
        this.logout();
        return { success: false };
      }
    } catch (error) {
      console.error('Erro ao verificar token:', error);
      return { success: false };
    }
  }

  // Fazer logout
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('auth_timestamp');
    window.location.href = 'login.html';
  }

  // Obter headers autenticados para requisições
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  // Requisição autenticada
  async authenticatedFetch(url, options = {}) {
    if (!this.isAuthenticated()) {
      window.location.href = 'login.html';
      return;
    }

    const defaultOptions = {
      headers: this.getAuthHeaders(),
      ...options
    };

    try {
      const response = await fetch(`${this.apiUrl}${url}`, defaultOptions);
      
      // Se token expirou
      if (response.status === 401 || response.status === 403) {
        const result = await this.verifyToken();
        if (!result.success) {
          this.logout();
          return { success: false, error: 'Sessão expirada' };
        }
        // Tentar novamente com novo token
        defaultOptions.headers.Authorization = `Bearer ${this.token}`;
        const retryResponse = await fetch(`${this.apiUrl}${url}`, defaultOptions);
        return await retryResponse.json();
      }

      return await response.json();
    } catch (error) {
      console.error('Erro na requisição:', error);
      return { success: false, error: 'Erro de conexão' };
    }
  }

  // Verificar permissões
  hasRole(role) {
    return this.user && this.user.role === role;
  }

  isAdmin() {
    return this.hasRole('admin');
  }

  isProfessor() {
    return this.hasRole('professor');
  }

  isAluno() {
    return this.hasRole('aluno');
  }
}

// Instância global
window.authService = new AuthService();