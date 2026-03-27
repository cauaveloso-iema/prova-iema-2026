"""
OMR (Optical Mark Recognition) - Versão Otimizada
"""

import cv2
import numpy as np
import imutils
import base64
import io
from PIL import Image
import os

class OMRReader:
    def __init__(self):
        # Configuração padrão (10 questões, 5 alternativas)
        self.num_questions = 10
        self.num_choices = 5
        self.choices = ['A', 'B', 'C', 'D', 'E']
        
        # 🔥 CONFIGURAÇÕES OTIMIZADAS
        self.bubble_threshold = 0.25      # 25% de preenchimento = marcado (mais sensível)
        self.contour_min_area = 50        # Área mínima da bolinha (menor)
        self.contour_max_area = 600       # Área máxima da bolinha (maior)
        
        # 🔥 CONFIGURAÇÕES DE PRÉ-PROCESSAMENTO
        self.blur_kernel = (3, 3)         # Kernel do blur
        self.adaptive_block = 11          # Tamanho do bloco para binarização
        self.adaptive_c = 2               # Constante da binarização
        
        # Cores para debug
        self.COLOR_GREEN = (0, 255, 0)
        self.COLOR_RED = (255, 0, 0)
        self.COLOR_BLUE = (0, 0, 255)
        
        # Debug mode
        self.debug = True
        self.debug_folder = "debug_omr"
        
        if self.debug and not os.path.exists(self.debug_folder):
            os.makedirs(self.debug_folder)
    
    def preprocess_image(self, image):
        """
        Pré-processamento da imagem para melhorar detecção
        """
        # Converter para escala de cinza
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/1_gray.jpg", gray)
        
        # Aplicar blur para reduzir ruído
        blurred = cv2.GaussianBlur(gray, self.blur_kernel, 0)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/2_blurred.jpg", blurred)
        
        # 🔥 Binarização adaptativa com parâmetros ajustáveis
        binary = cv2.adaptiveThreshold(blurred, 255,
                                       cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY_INV, 
                                       self.adaptive_block, 
                                       self.adaptive_c)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/3_binary.jpg", binary)
        
        # 🔥 Operação morfológica para fechar pequenos buracos
        kernel = np.ones((2, 2), np.uint8)
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/4_closed.jpg", closed)
        
        return closed
    
    def detect_bubbles(self, binary_image, original_image):
        """
        Detecta todas as bolinhas no cartão
        """
        # Encontrar contornos
        cnts = cv2.findContours(binary_image.copy(), cv2.RETR_EXTERNAL,
                                cv2.CHAIN_APPROX_SIMPLE)
        cnts = imutils.grab_contours(cnts)
        
        bubbles = []
        
        for c in cnts:
            area = cv2.contourArea(c)
            
            # Filtrar por área
            if self.contour_min_area < area < self.contour_max_area:
                # Calcular círculo circunscrito
                (x, y), radius = cv2.minEnclosingCircle(c)
                center = (int(x), int(y))
                radius = int(radius)
                
                # 🔥 Verificar se é circular o suficiente
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter * perimeter)
                    if circularity > 0.5:  # Aceitar apenas formas circulares
                        bubbles.append({
                            'center': center,
                            'radius': radius,
                            'area': area,
                            'circularity': circularity,
                            'contour': c
                        })
        
        # Ordenar por posição (cima para baixo, esquerda para direita)
        bubbles.sort(key=lambda b: (b['center'][1], b['center'][0]))
        
        if self.debug:
            debug_img = original_image.copy()
            for b in bubbles:
                cv2.circle(debug_img, b['center'], b['radius'], self.COLOR_GREEN, 2)
            cv2.imwrite(f"{self.debug_folder}/5_bubbles_detected.jpg", debug_img)
        
        return bubbles
    
    def group_by_question(self, bubbles):
        """
        Agrupa bolinhas por questão
        """
        expected_total = self.num_questions * self.num_choices
        
        if len(bubbles) != expected_total:
            print(f"⚠️ Aviso: Esperado {expected_total} bolinhas, encontrado {len(bubbles)}")
            
            # 🔥 TENTAR AGRUPAR MESMO ASSIM
            if len(bubbles) > 0:
                # Calcular número médio de bolinhas por linha
                y_positions = [b['center'][1] for b in bubbles]
                y_unique = sorted(set(y_positions))
                
                # Se temos aproximadamente 5 linhas
                if len(y_unique) >= 4:
                    # Agrupar por Y (linhas)
                    rows = []
                    for y in y_unique:
                        row_bubbles = [b for b in bubbles if abs(b['center'][1] - y) < 20]
                        if len(row_bubbles) >= self.num_choices:
                            rows.append(sorted(row_bubbles, key=lambda b: b['center'][0]))
                    
                    if len(rows) >= self.num_choices:
                        # Transpor para obter colunas
                        questions = []
                        for i in range(self.num_choices):
                            for j in range(len(rows)):
                                if i < len(rows[j]):
                                    if j < len(questions):
                                        questions[j].append(rows[j][i])
                                    else:
                                        questions.append([rows[j][i]])
                        
                        if len(questions) >= self.num_questions:
                            return questions[:self.num_questions]
        
        # Agrupamento padrão
        questions = []
        for i in range(0, len(bubbles), self.num_choices):
            if i + self.num_choices <= len(bubbles):
                question_bubbles = bubbles[i:i + self.num_choices]
                question_bubbles.sort(key=lambda b: b['center'][0])
                questions.append(question_bubbles)
        
        return questions
    
    def analyze_bubble(self, bubble, binary_image):
        """
        Analisa o preenchimento de uma bolinha
        """
        center = bubble['center']
        radius = bubble['radius']
        
        # Criar máscara circular
        mask = np.zeros(binary_image.shape, dtype=np.uint8)
        cv2.circle(mask, center, radius, 255, -1)
        
        # Aplicar máscara
        masked = cv2.bitwise_and(binary_image, binary_image, mask=mask)
        
        # Contar pixels
        total_pixels = np.sum(mask > 0)
        filled_pixels = np.sum(masked > 0)
        
        fill_ratio = filled_pixels / total_pixels if total_pixels > 0 else 0
        
        return fill_ratio
    
    def detect(self, image_path=None, image_base64=None):
        """
        Função principal de detecção
        """
        # Carregar imagem
        if image_base64:
            if ',' in image_base64:
                image_base64 = image_base64.split(',')[1]
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))
            image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        elif image_path:
            image = cv2.imread(image_path)
        else:
            return {'error': 'Nenhuma imagem fornecida', 'answers': []}
        
        original = image.copy()
        
        # Redimensionar para tamanho padrão (ajuda na detecção)
        scale = min(1200 / image.shape[1], 1)
        if scale < 1:
            new_width = int(image.shape[1] * scale)
            new_height = int(image.shape[0] * scale)
            image = cv2.resize(image, (new_width, new_height))
        
        # Pré-processar
        binary = self.preprocess_image(image)
        
        # Detectar bolinhas
        bubbles = self.detect_bubbles(binary, image)
        
        if len(bubbles) == 0:
            return {
                'success': False,
                'error': 'Nenhuma bolinha detectada. Verifique a iluminação e o posicionamento.',
                'answers': [],
                'detected_bubbles': 0
            }
        
        # Agrupar por questão
        questions = self.group_by_question(bubbles)
        
        if not questions:
            return {
                'success': False,
                'error': f'Falha ao agrupar bolinhas. Detectadas {len(bubbles)} bolinhas, esperado {self.num_questions * self.num_choices}.',
                'answers': [],
                'detected_bubbles': len(bubbles)
            }
        
        # Analisar cada questão
        answers = []
        debug_info = []
        
        for q_idx, question_bubbles in enumerate(questions):
            if q_idx >= self.num_questions:
                break
            
            best_choice = None
            best_fill = 0
            
            for c_idx, bubble in enumerate(question_bubbles):
                if c_idx >= self.num_choices:
                    break
                    
                fill_ratio = self.analyze_bubble(bubble, binary)
                
                debug_info.append({
                    'question': q_idx + 1,
                    'choice': self.choices[c_idx],
                    'fill_ratio': round(fill_ratio, 3)
                })
                
                if fill_ratio > self.bubble_threshold and fill_ratio > best_fill:
                    best_fill = fill_ratio
                    best_choice = self.choices[c_idx]
            
            answers.append(best_choice if best_choice else None)
            
            # Desenhar para debug
            if self.debug:
                for c_idx, bubble in enumerate(question_bubbles):
                    if c_idx >= self.num_choices:
                        break
                    center = bubble['center']
                    radius = bubble['radius']
                    color = self.COLOR_GREEN if self.choices[c_idx] == best_choice else self.COLOR_RED
                    cv2.circle(original, center, radius, color, 2)
                    cv2.putText(original, self.choices[c_idx],
                               (center[0] - 10, center[1] - 10),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        # Salvar imagem de debug
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/result.jpg", original)
        
        # Estatísticas
        detected_count = sum(1 for a in answers if a is not None)
        
        return {
            'success': True,
            'answers': answers,
            'debug_info': debug_info,
            'statistics': {
                'total_questions': len(questions),
                'detected_answers': detected_count,
                'detection_rate': round(detected_count / len(questions) * 100, 1),
                'total_bubbles': len(bubbles),
                'expected_bubbles': self.num_questions * self.num_choices
            }
        }


# Instância global
omr = OMRReader()