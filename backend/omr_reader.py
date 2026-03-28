"""
OMR (Optical Mark Recognition) - Versão Ultra Otimizada
Detecção de bolinhas com correção de perspectiva e análise avançada
"""

import cv2
import numpy as np
import imutils
import base64
import io
from PIL import Image
import os
import time
from collections import defaultdict

class OMRReader:
    def __init__(self):
        # Configuração padrão (10 questões, 5 alternativas)
        self.num_questions = 10
        self.num_choices = 5
        self.choices = ['A', 'B', 'C', 'D', 'E']
        
        # ========== CONFIGURAÇÕES OTIMIZADAS PARA MAIOR PRECISÃO ==========
        # Detecção de preenchimento
        self.bubble_threshold = 0.20          # 20% de preenchimento = marcado
        self.bubble_filled_threshold = 0.60   # Acima disso = definitivamente marcado
        self.bubble_empty_threshold = 0.12    # Abaixo disso = definitivamente vazio
        
        # Filtros de contorno (ajustados para EVALBE)
        self.contour_min_area = 25             # Área mínima (bolinhas pequenas)
        self.contour_max_area = 500            # Área máxima (bolinhas grandes)
        self.circularity_min = 0.52            # Circularidade mínima (0.5 = meio círculo)
        
        # ========== CONFIGURAÇÕES DE PRÉ-PROCESSAMENTO ==========
        self.blur_kernel = (3, 3)              # Kernel do blur
        self.adaptive_block = 13               # Tamanho do bloco (ímpar, maior = mais suave)
        self.adaptive_c = 2                    # Constante da binarização
        
        # ========== CORREÇÃO DE PERSPECTIVA (EVALBE) ==========
        self.use_perspective_correction = True
        self.corner_detection_threshold = 0.15  # 15% da área preta = marca detectada
        self.corner_search_margin = 0.15        # 15% da margem para busca dos cantos
        
        # ========== ANÁLISE DE QUALIDADE ==========
        self.quality_threshold = {
            'good': 0.8,      # 80% das bolinhas detectadas = boa qualidade
            'fair': 0.5,      # 50% = qualidade razoável
            'poor': 0.3       # 30% = qualidade ruim
        }
        
        # Cores para debug
        self.COLOR_GREEN = (0, 255, 0)
        self.COLOR_RED = (255, 0, 0)
        self.COLOR_BLUE = (0, 0, 255)
        self.COLOR_YELLOW = (0, 255, 255)
        self.COLOR_ORANGE = (0, 165, 255)
        self.COLOR_PURPLE = (255, 0, 255)
        
        # Debug mode
        self.debug = True
        self.debug_counter = 0
        self.debug_folder = "debug_omr"
        
        if self.debug and not os.path.exists(self.debug_folder):
            os.makedirs(self.debug_folder)
        
        # Estatísticas de performance
        self.performance_stats = {
            'total_processed': 0,
            'avg_time_ms': 0,
            'last_time_ms': 0
        }
        
        print("[OMR] OMR Reader inicializado - Versão Ultra Otimizada")
        print(f"[OMR] Configurações: {self.num_questions} questões, {self.num_choices} alternativas")
        print(f"[OMR] Threshold preenchimento: {self.bubble_threshold}")
        print(f"[OMR] Correção de perspectiva: {'Ativada' if self.use_perspective_correction else 'Desativada'}")
    
    def detect_corners_evalbe(self, image):
        """
        Detecta os 4 cantos pretos do cartão EVALBE para correção de perspectiva
        Retorna os 4 pontos ou None se não encontrar
        """
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Aumentar contraste
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        # Binarizar para encontrar marcas pretas
        _, binary = cv2.threshold(gray, 50, 255, cv2.THRESH_BINARY_INV)
        
        # Encontrar contornos
        cnts = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = imutils.grab_contours(cnts)
        
        corners = []
        
        for c in cnts:
            area = cv2.contourArea(c)
            # Área típica das marcas de referência (entre 20 e 200 pixels)
            if 20 < area < 200:
                # Calcular centro
                M = cv2.moments(c)
                if M["m00"] != 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    
                    # Determinar em qual quadrante está
                    margin_x = int(w * self.corner_search_margin)
                    margin_y = int(h * self.corner_search_margin)
                    
                    if cx < margin_x and cy < margin_y:
                        corners.append(('tl', (cx, cy)))  # Top Left
                    elif cx > w - margin_x and cy < margin_y:
                        corners.append(('tr', (cx, cy)))  # Top Right
                    elif cx < margin_x and cy > h - margin_y:
                        corners.append(('bl', (cx, cy)))  # Bottom Left
                    elif cx > w - margin_x and cy > h - margin_y:
                        corners.append(('br', (cx, cy)))  # Bottom Right
        
        # Organizar na ordem: TL, TR, BR, BL
        ordered = [None, None, None, None]
        for pos, point in corners:
            if pos == 'tl':
                ordered[0] = point
            elif pos == 'tr':
                ordered[1] = point
            elif pos == 'br':
                ordered[2] = point
            elif pos == 'bl':
                ordered[3] = point
        
        if all(p is not None for p in ordered):
            return np.array(ordered, dtype=np.float32)
        
        return None
    
    def correct_perspective(self, image, corners=None):
        """
        Corrige a perspectiva do cartão para uma vista de topo
        """
        if not self.use_perspective_correction:
            return image
        
        if corners is None:
            corners = self.detect_corners_evalbe(image)
        
        if corners is None or len(corners) != 4:
            return image
        
        # Definir tamanho da imagem corrigida
        h, w = image.shape[:2]
        target_w = int(w * 0.95)
        target_h = int(h * 0.95)
        
        # Pontos de destino (retângulo)
        dst = np.array([
            [0, 0],
            [target_w - 1, 0],
            [target_w - 1, target_h - 1],
            [0, target_h - 1]
        ], dtype=np.float32)
        
        # Calcular e aplicar transformação
        M = cv2.getPerspectiveTransform(corners, dst)
        corrected = cv2.warpPerspective(image, M, (target_w, target_h))
        
        return corrected
    
    def preprocess_image(self, image):
        """
        Pré-processamento da imagem para melhorar detecção
        """
        # Converter para escala de cinza
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_1_gray.jpg", gray)
        
        # CLAHE para melhorar contraste
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_2_clahe.jpg", gray)
        
        # Aplicar blur para reduzir ruído
        blurred = cv2.GaussianBlur(gray, self.blur_kernel, 0)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_3_blurred.jpg", blurred)
        
        # Binarização adaptativa
        binary = cv2.adaptiveThreshold(blurred, 255,
                                       cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY_INV, 
                                       self.adaptive_block, 
                                       self.adaptive_c)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_4_binary.jpg", binary)
        
        # Operação morfológica para fechar pequenos buracos
        kernel = np.ones((2, 2), np.uint8)
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_5_closed.jpg", closed)
        
        return closed
    
    def detect_bubbles(self, binary_image, original_image):
        """
        Detecta todas as bolinhas no cartão com filtros rigorosos
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
                
                # Verificar circularidade
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter * perimeter)
                    
                    # Aceitar apenas formas circulares
                    if circularity > self.circularity_min:
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
                cv2.circle(debug_img, b['center'], b['radius'], self.COLOR_YELLOW, 2)
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_6_bubbles.jpg", debug_img)
        
        return bubbles
    
    def group_by_question(self, bubbles):
        """
        Agrupa bolinhas por questão usando análise de layout inteligente
        """
        if len(bubbles) == 0:
            return []
        
        expected_total = self.num_questions * self.num_choices
        
        if len(bubbles) != expected_total:
            print(f"[OMR] ⚠️ Aviso: Esperado {expected_total} bolinhas, encontrado {len(bubbles)}")
        
        # MÉTODO 1: Agrupamento por linhas (ideal para EVALBE)
        y_positions = [b['center'][1] for b in bubbles]
        y_unique = sorted(set(y_positions))
        
        # Agrupar Y's próximos (mesma linha)
        y_clusters = []
        if y_unique:
            current_cluster = [y_unique[0]]
            for y in y_unique[1:]:
                if y - current_cluster[-1] < 25:
                    current_cluster.append(y)
                else:
                    y_clusters.append(np.mean(current_cluster))
                    current_cluster = [y]
            if current_cluster:
                y_clusters.append(np.mean(current_cluster))
        
        # Para cada linha, pegar bolinhas com Y próximo
        rows = []
        for y_center in y_clusters:
            row_bubbles = [b for b in bubbles if abs(b['center'][1] - y_center) < 20]
            if len(row_bubbles) >= self.num_choices:
                row_bubbles.sort(key=lambda b: b['center'][0])
                rows.append(row_bubbles)
        
        # Se temos o número correto de linhas, transpor para questões
        if len(rows) >= self.num_questions:
            rows = rows[:self.num_questions]
            
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
        
        # MÉTODO 2: Agrupamento sequencial (fallback)
        questions = []
        for i in range(0, len(bubbles), self.num_choices):
            if i + self.num_choices <= len(bubbles):
                question_bubbles = bubbles[i:i + self.num_choices]
                question_bubbles.sort(key=lambda b: b['center'][0])
                questions.append(question_bubbles)
        
        return questions[:self.num_questions]
    
    def analyze_bubble(self, bubble, binary_image):
        """
        Analisa o preenchimento de uma bolinha com classificação avançada
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
        
        # Classificar o preenchimento
        if fill_ratio >= self.bubble_filled_threshold:
            status = "filled"
            confidence = min(1.0, fill_ratio / 0.8)
        elif fill_ratio <= self.bubble_empty_threshold:
            status = "empty"
            confidence = 1.0 - (fill_ratio / self.bubble_empty_threshold)
        else:
            status = "partial"
            confidence = (fill_ratio - self.bubble_empty_threshold) / (self.bubble_filled_threshold - self.bubble_empty_threshold)
        
        return {
            'fill_ratio': fill_ratio,
            'status': status,
            'confidence': confidence,
            'is_marked': fill_ratio > self.bubble_threshold
        }
    
    def generate_debug_image(self, original_image, questions, answers, fill_ratios):
        """
        Gera imagem de debug com anotações visuais
        """
        debug_img = original_image.copy()
        
        # Adicionar legenda
        h, w = debug_img.shape[:2]
        legend_y = 30
        legend_x = 10
        
        # Fundo da legenda
        cv2.rectangle(debug_img, (legend_x - 5, legend_y - 20), (legend_x + 200, legend_y + 70), (50, 50, 50), -1)
        
        cv2.putText(debug_img, "LEGENDA:", (legend_x, legend_y),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(debug_img, "VERDE = Marcada", (legend_x, legend_y + 20),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_GREEN, 1)
        cv2.putText(debug_img, "VERMELHO = Não marcada", (legend_x, legend_y + 35),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_RED, 1)
        cv2.putText(debug_img, "AZUL = Escolhida", (legend_x, legend_y + 50),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_BLUE, 1)
        
        for q_idx, question_bubbles in enumerate(questions):
            if q_idx >= len(answers):
                break
            
            answer = answers[q_idx]
            fills = fill_ratios[q_idx] if q_idx < len(fill_ratios) else {}
            
            for c_idx, bubble in enumerate(question_bubbles):
                if c_idx >= self.num_choices:
                    break
                
                center = bubble['center']
                radius = bubble['radius']
                choice = self.choices[c_idx]
                fill = fills.get(choice, 0)
                
                # Definir cor
                if choice == answer:
                    color = self.COLOR_BLUE
                    thickness = 4
                elif fill > self.bubble_threshold:
                    color = self.COLOR_GREEN
                    thickness = 2
                else:
                    color = self.COLOR_RED
                    thickness = 2
                
                cv2.circle(debug_img, center, radius, color, thickness)
                cv2.putText(debug_img, choice,
                           (center[0] - 10, center[1] - 10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
                
                # Mostrar percentual
                percent = int(fill * 100)
                cv2.putText(debug_img, f"{percent}%",
                           (center[0] - 15, center[1] + radius + 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.3, (150, 150, 150), 1)
            
            # Número da questão
            if question_bubbles:
                first = question_bubbles[0]
                x = first['center'][0] - 25
                y = first['center'][1] - 20
                cv2.putText(debug_img, f"{q_idx + 1}", (x, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, self.COLOR_YELLOW, 2)
        
        return debug_img
    
    def assess_quality(self, bubbles, questions, answers):
        """
        Avalia a qualidade da detecção
        """
        expected_bubbles = self.num_questions * self.num_choices
        detection_rate = len(bubbles) / expected_bubbles if expected_bubbles > 0 else 0
        answer_rate = sum(1 for a in answers if a is not None) / len(answers) if answers else 0
        
        if detection_rate > self.quality_threshold['good'] and answer_rate > 0.7:
            quality = "excelente"
            message = "Detecção excelente! Todas as bolinhas foram identificadas."
        elif detection_rate > self.quality_threshold['fair']:
            quality = "boa"
            message = "Detecção boa. A maioria das bolinhas foi identificada."
        elif detection_rate > self.quality_threshold['poor']:
            quality = "regular"
            message = "Detecção regular. Algumas bolinhas podem não ter sido identificadas."
        else:
            quality = "ruim"
            message = "Detecção ruim. Verifique a iluminação e o posicionamento do cartão."
        
        return {
            'quality': quality,
            'message': message,
            'detection_rate': round(detection_rate * 100, 1),
            'answer_rate': round(answer_rate * 100, 1),
            'bubbles_found': len(bubbles),
            'bubbles_expected': expected_bubbles
        }
    
    def detect(self, image_path=None, image_base64=None, gabarito=None):
        """
        Função principal de detecção - Retorna as respostas detectadas
        """
        start_time = time.time()
        self.debug_counter += 1
        
        print(f"[OMR] === Detecção #{self.debug_counter} ===")
        
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
        
        print(f"[OMR] Imagem: {image.shape[1]}x{image.shape[0]}")
        
        # Redimensionar para tamanho padrão
        scale = min(1400 / image.shape[1], 1)
        if scale < 1:
            new_width = int(image.shape[1] * scale)
            new_height = int(image.shape[0] * scale)
            image = cv2.resize(image, (new_width, new_height))
            print(f"[OMR] Redimensionado para: {new_width}x{new_height}")
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_0_original.jpg", image)
        
        # CORREÇÃO DE PERSPECTIVA (EVALBE)
        if self.use_perspective_correction:
            corners = self.detect_corners_evalbe(image)
            if corners is not None:
                print(f"[OMR] Marcas EVALBE detectadas! Corrigindo perspectiva...")
                image = self.correct_perspective(image, corners)
                if self.debug:
                    cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_0a_corrected.jpg", image)
            else:
                print(f"[OMR] Marcas EVALBE não detectadas, usando imagem original")
        
        # Pré-processar
        binary = self.preprocess_image(image)
        
        # Detectar bolinhas
        bubbles = self.detect_bubbles(binary, image)
        
        if len(bubbles) == 0:
            print(f"[OMR] ❌ Nenhuma bolinha detectada!")
            return {
                'success': False,
                'error': 'Nenhuma bolinha detectada. Verifique a iluminação e o posicionamento.',
                'answers': [],
                'detected_bubbles': 0
            }
        
        print(f"[OMR] ✅ Detectadas {len(bubbles)} bolinhas")
        
        # Agrupar por questão
        questions = self.group_by_question(bubbles)
        
        if not questions:
            print(f"[OMR] ❌ Falha ao agrupar bolinhas!")
            return {
                'success': False,
                'error': f'Falha ao agrupar bolinhas. Detectadas {len(bubbles)} bolinhas.',
                'answers': [],
                'detected_bubbles': len(bubbles)
            }
        
        print(f"[OMR] ✅ Agrupadas em {len(questions)} questões")
        
        # Analisar cada questão
        answers = []
        fill_ratios_list = []
        debug_info = []
        
        for q_idx, question_bubbles in enumerate(questions):
            if q_idx >= self.num_questions:
                break
            
            best_choice = None
            best_fill = 0
            fills = {}
            
            for c_idx, bubble in enumerate(question_bubbles):
                if c_idx >= self.num_choices:
                    break
                
                analysis = self.analyze_bubble(bubble, binary)
                fill_ratio = analysis['fill_ratio']
                choice = self.choices[c_idx]
                fills[choice] = fill_ratio
                
                debug_info.append({
                    'question': q_idx + 1,
                    'choice': choice,
                    'fill_ratio': round(fill_ratio, 3),
                    'status': analysis['status'],
                    'is_marked': analysis['is_marked']
                })
                
                if analysis['is_marked'] and fill_ratio > best_fill:
                    best_fill = fill_ratio
                    best_choice = choice
            
            answers.append(best_choice if best_choice else None)
            fill_ratios_list.append(fills)
        
        # Avaliar qualidade
        quality = self.assess_quality(bubbles, questions, answers)
        print(f"[OMR] Qualidade: {quality['quality'].upper()} - {quality['detection_rate']}% de detecção")
        
        # Calcular acertos se tiver gabarito
        score = 0
        if gabarito and len(gabarito) == len(answers):
            for i, ans in enumerate(answers):
                if ans and ans == gabarito[i]:
                    score += 1
            print(f"[OMR] Acertos: {score}/{len(answers)} (Nota: {score * 10 / len(answers):.1f})")
        
        # Gerar imagem de debug
        debug_img = self.generate_debug_image(image, questions, answers, fill_ratios_list)
        _, buffer = cv2.imencode('.jpg', debug_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        debug_base64 = base64.b64encode(buffer).decode('utf-8')
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/{self.debug_counter}_7_result.jpg", debug_img)
        
        # Estatísticas
        detected_count = sum(1 for a in answers if a is not None)
        processing_time_ms = (time.time() - start_time) * 1000
        
        # Atualizar performance
        self.performance_stats['total_processed'] += 1
        self.performance_stats['last_time_ms'] = processing_time_ms
        self.performance_stats['avg_time_ms'] = (
            (self.performance_stats['avg_time_ms'] * (self.performance_stats['total_processed'] - 1) + processing_time_ms)
            / self.performance_stats['total_processed']
        )
        
        print(f"[OMR] Processamento concluído em {processing_time_ms:.0f}ms")
        print(f"[OMR] =================================")
        
        return {
            'success': True,
            'answers': answers,
            'score': score if gabarito else None,
            'nota': (score * 10 / len(answers)) if gabarito and answers else None,
            'debug_info': debug_info,
            'debug_image': debug_base64,
            'quality': quality,
            'statistics': {
                'total_questions': len(questions),
                'detected_answers': detected_count,
                'detection_rate': round(detected_count / len(questions) * 100, 1),
                'total_bubbles': len(bubbles),
                'expected_bubbles': self.num_questions * self.num_choices,
                'processing_time_ms': round(processing_time_ms, 2)
            },
            'performance': self.performance_stats
        }


# Instância global
omr = OMRReader()


# Função de teste rápida
def test_omr():
    """Função para testar o OMR com uma imagem de exemplo"""
    print("\n[OMR] Modo de teste - Use a API para processar imagens reais")
    print("[OMR] Para usar: from omr_server import omr; result = omr.detect(image_base64=...)")

if __name__ == "__main__":
    test_omr()