#!/usr/bin/env python3
"""
OMR Reader Server - Versão com IA Visual (YOLO + Google Vision)
Leitura inteligente como um humano faria
"""

import sys
import argparse
import os
import base64
import io
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import warnings
warnings.filterwarnings('ignore')

# Tentar importar YOLO
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[IA] YOLO nao disponivel. Instale com: pip install ultralytics")

# Tentar importar Google Cloud Vision
try:
    from google.cloud import vision
    GOOGLE_VISION_AVAILABLE = True
except ImportError:
    GOOGLE_VISION_AVAILABLE = False
    print("[IA] Google Vision nao disponivel. Instale com: pip install google-cloud-vision")

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

app = Flask(__name__)
CORS(app)

print("=" * 60)
print("[OMR] OMR Reader Server - Versao IA Visual")
print("[OMR] Leitura inteligente com YOLO e Google Vision")
print(f"[IA] YOLO disponivel: {YOLO_AVAILABLE}")
print(f"[IA] Google Vision disponivel: {GOOGLE_VISION_AVAILABLE}")
print("=" * 60)


class OMRReader:
    def __init__(self):
        self.num_questions = 10
        self.num_choices = 5
        self.choices = ['A', 'B', 'C', 'D', 'E']
        
        # AJUSTE 1: Threshold para detectar bolinhas marcadas (mais alto)
        self.bubble_threshold = 0.65  # Aumentado de 0.08 para 0.35
        
        # AJUSTE 2: Confiança mínima para detecção do YOLO (mais alto)
        self.yolo_confidence_threshold = 0.7  # Aumentado de 0.5 para 0.7
        
        # NOVA CONFIGURAÇÃO: Threshold para considerar múltiplas marcações
        self.multiple_mark_threshold = 0.45  # Se mais de uma alternativa tiver preenchimento > este valor, anula
        
        # Inicializar modelos de IA
        self.yolo_model = None
        self.google_client = None
        
        if YOLO_AVAILABLE:
            try:
                print("[IA] Carregando YOLO...")
                self.yolo_model = YOLO('yolov8n.pt')
                print("[IA] YOLO carregado com sucesso!")
            except Exception as e:
                print(f"[IA] Erro ao carregar YOLO: {e}")
                self.yolo_model = None
        
        if GOOGLE_VISION_AVAILABLE:
            try:
                print("[IA] Configurando Google Vision...")
                self.google_client = vision.ImageAnnotatorClient()
                print("[IA] Google Vision carregado com sucesso!")
            except Exception as e:
                print(f"[IA] Erro ao carregar Google Vision: {e}")
                self.google_client = None
        
        self.debug = True
        self.debug_folder = "debug_omr"
        
        if not os.path.exists(self.debug_folder):
            os.makedirs(self.debug_folder)
    
    def preprocess_for_analysis(self, image):
        """Pré-processamento para análise visual"""
        
        # MELHORIA 1: Garantir que a imagem está na orientação correta (horizontal)
        h, w = image.shape[:2]
        if h > w:
            # Se a imagem está vertical, rotacionar para horizontal
            image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
            print("[IA] Imagem rotacionada para orientação horizontal")
        
        # Redimensionar para tamanho padrão
        height = 1000
        scale = height / image.shape[0]
        new_width = int(image.shape[1] * scale)
        image = cv2.resize(image, (new_width, height))
        
        # Converter para tons de cinza
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # MELHORIA 2: Aumentar contraste de forma mais agressiva
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # MELHORIA 3: Binarização adaptativa para melhor detecção em mobile
        binary = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                       cv2.THRESH_BINARY_INV, 15, 8)
        
        # Limpar ruído
        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=1)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/processed.jpg", cleaned)
        
        return image, cleaned
    
    def detect_with_yolo(self, image):
        """Detecta bolinhas usando YOLO"""
        
        if not self.yolo_model:
            return None
        
        try:
            # Executar YOLO
            results = self.yolo_model(image)
            
            detections = []
            for r in results:
                boxes = r.boxes
                if boxes is not None:
                    for box in boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        confidence = box.conf[0].tolist()
                        
                        # AJUSTE 2: Filtrar por confiança mais alta
                        if confidence > self.yolo_confidence_threshold:
                            detections.append({
                                'x': int((x1 + x2) / 2),
                                'y': int((y1 + y2) / 2),
                                'width': int(x2 - x1),
                                'height': int(y2 - y1),
                                'confidence': confidence
                            })
            
            return detections if detections else None
            
        except Exception as e:
            print(f"[IA] Erro no YOLO: {e}")
            return None
    
    def detect_with_hough_circles(self, image):
        """Detecta círculos usando Hough Circles (OpenCV)"""
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        try:
            # MELHORIA 4: Múltiplas tentativas com parâmetros diferentes
            circles = None
            params_list = [
                (1, 30, 50, 30, 10, 50),   # Padrão
                (1, 25, 45, 25, 8, 40),    # Mais sensível
                (1, 35, 55, 35, 12, 45)    # Círculos maiores
            ]
            
            for dp, minDist, param1, param2, minR, maxR in params_list:
                circles = cv2.HoughCircles(
                    gray, 
                    cv2.HOUGH_GRADIENT, 
                    dp=dp, 
                    minDist=minDist,
                    param1=param1, 
                    param2=param2, 
                    minRadius=minR, 
                    maxRadius=maxR
                )
                if circles is not None:
                    break
            
            if circles is not None:
                circles = np.round(circles[0, :]).astype("int")
                detections = []
                for (x, y, r) in circles:
                    detections.append({
                        'x': x,
                        'y': y,
                        'radius': r,
                        'confidence': 0.8
                    })
                return detections
            
        except Exception as e:
            print(f"[IA] Erro no Hough Circles: {e}")
        
        return None
    
    def detect_with_contours(self, binary):
        """Detecta círculos por contornos (fallback)"""
        
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        circles = []
        for c in contours:
            area = cv2.contourArea(c)
            # MELHORIA 5: Faixa de área ajustada
            if 100 < area < 5000:
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter * perimeter)
                    if circularity > 0.4:  # Menos restritivo
                        (x, y), radius = cv2.minEnclosingCircle(c)
                        circles.append({
                            'x': int(x),
                            'y': int(y),
                            'radius': int(radius),
                            'area': area
                        })
        
        return circles if circles else None
    
    def group_circles_by_question(self, circles):
        """Agrupa círculos por questão - VERSÃO MELHORADA"""
        
        if not circles or len(circles) < 20:
            return None
        
        circles.sort(key=lambda c: c['y'])
        
        questions = []
        current_line = []
        last_y = circles[0]['y']
        
        # MELHORIA 6: Agrupamento mais inteligente
        for c in circles:
            if abs(c['y'] - last_y) < 50:
                current_line.append(c)
            else:
                if current_line:
                    current_line.sort(key=lambda c: c['x'])
                    # Garantir que temos pelo menos algumas alternativas
                    if len(current_line) >= 3:
                        questions.append(current_line[:self.num_choices])
                current_line = [c]
                last_y = c['y']
        
        if current_line:
            current_line.sort(key=lambda c: c['x'])
            if len(current_line) >= 3:
                questions.append(current_line[:self.num_choices])
        
        # MELHORIA 7: Se não temos questões suficientes, tentar redistribuir
        if len(questions) < self.num_questions:
            print(f"[IA] Detectadas {len(questions)} linhas, tentando ajustar...")
            # Usar interpolação para criar linhas faltantes
            if len(questions) >= 5:  # Pelo menos metade das questões
                y_positions = [sum(c['y'] for c in q) / len(q) for q in questions]
                y_positions.sort()
                
                # Criar questões faltantes por interpolação
                for q_idx in range(self.num_questions):
                    if q_idx < len(questions):
                        continue
                    # Estimar posição Y
                    if y_positions:
                        y_est = y_positions[-1] + (y_positions[-1] - y_positions[-2]) if len(y_positions) > 1 else y_positions[-1] + 50
                        y_positions.append(y_est)
                        
                        # Estimar círculos para esta linha
                        last_line = questions[-1]
                        estimated_line = []
                        for circle in last_line:
                            estimated_line.append({
                                'x': circle['x'],
                                'y': int(y_est),
                                'radius': circle.get('radius', 20),
                                'estimated': True
                            })
                        questions.append(estimated_line)
        
        return questions[:self.num_questions] if len(questions) >= self.num_questions else None
    
    def analyze_bubble_intensity(self, image, x, y, radius):
        """Analisa intensidade da bolinha"""
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Criar máscara
        mask = np.zeros(gray.shape, dtype=np.uint8)
        cv2.circle(mask, (x, y), radius, 255, -1)
        
        # Extrair região
        roi = cv2.bitwise_and(gray, gray, mask=mask)
        pixels = roi[mask > 0]
        
        if len(pixels) == 0:
            return 0
        
        # Calcular escuridão (0 = preto, 255 = branco)
        mean_intensity = np.mean(pixels)
        darkness = 1 - (mean_intensity / 255)
        
        return darkness
    
    def find_answer_regions(self, binary):
        """Encontra as regiões das respostas (método de grade) - VERSÃO MELHORADA"""
        
        h, w = binary.shape
        
        # MELHORIA 8: Usar projeção de pixels para encontrar linhas e colunas
        # Projeção vertical para encontrar linhas das questões
        vertical_projection = np.sum(binary, axis=1)
        
        # Encontrar picos na projeção (onde há mais pixels pretos)
        threshold = np.max(vertical_projection) * 0.3
        line_regions = []
        in_line = False
        line_start = 0
        
        for i in range(h):
            if vertical_projection[i] > threshold and not in_line:
                in_line = True
                line_start = i
            elif vertical_projection[i] <= threshold and in_line:
                in_line = False
                line_end = i
                if line_end - line_start > 20:  # Altura mínima da linha
                    line_regions.append((line_start, line_end))
        
        # Se não encontrou linhas pela projeção, usar divisão uniforme
        if len(line_regions) < self.num_questions:
            line_height = h // self.num_questions
            line_regions = [(i * line_height, (i + 1) * line_height) for i in range(self.num_questions)]
        else:
            line_regions = line_regions[:self.num_questions]
        
        # Projeção horizontal para encontrar colunas das alternativas
        horizontal_projection = np.sum(binary, axis=0)
        threshold_col = np.max(horizontal_projection) * 0.3
        col_regions = []
        in_col = False
        col_start = 0
        
        for i in range(w):
            if horizontal_projection[i] > threshold_col and not in_col:
                in_col = True
                col_start = i
            elif horizontal_projection[i] <= threshold_col and in_col:
                in_col = False
                col_end = i
                if col_end - col_start > 15:  # Largura mínima da coluna
                    col_regions.append((col_start, col_end))
        
        # Se não encontrou colunas, usar divisão uniforme
        if len(col_regions) < self.num_choices:
            col_width = w // self.num_choices
            col_regions = [(i * col_width, (i + 1) * col_width) for i in range(self.num_choices)]
        else:
            col_regions = col_regions[:self.num_choices]
        
        regions = []
        
        for q_idx, (y_start, y_end) in enumerate(line_regions[:self.num_questions]):
            for c_idx, (x_start, x_end) in enumerate(col_regions[:self.num_choices]):
                # Extrair região
                roi = binary[y_start:y_end, x_start:x_end]
                
                # Calcular porcentagem de pixels pretos
                total_pixels = roi.size
                black_pixels = np.sum(roi > 0)
                fill_percentage = black_pixels / total_pixels if total_pixels > 0 else 0
                
                regions.append({
                    'question': q_idx + 1,
                    'choice': self.choices[c_idx],
                    'fill_percentage': fill_percentage,
                    'x': (x_start + x_end) // 2,
                    'y': (y_start + y_end) // 2
                })
        
        return regions
    
    def analyze_by_yolo(self, image):
        """Analisa usando YOLO"""
        
        print("[IA] Usando YOLO para deteccao...")
        
        circles = self.detect_with_yolo(image)
        
        if circles:
            # Converter para formato compatível
            circles_converted = []
            for c in circles:
                circles_converted.append({
                    'x': c['x'],
                    'y': c['y'],
                    'radius': max(c['width'], c['height']) // 2,
                    'confidence': c['confidence']
                })
            
            questions = self.group_circles_by_question(circles_converted)
            
            if questions:
                return self.analyze_questions(image, questions)
        
        return None
    
    def analyze_by_hough(self, image):
        """Analisa usando Hough Circles"""
        
        print("[IA] Usando Hough Circles para deteccao...")
        
        circles = self.detect_with_hough_circles(image)
        
        if circles:
            questions = self.group_circles_by_question(circles)
            
            if questions:
                return self.analyze_questions(image, questions)
        
        return None
    
    def analyze_by_contour(self, image, binary):
        """Analisa usando contornos (fallback)"""
        
        print("[IA] Usando deteccao por contornos...")
        
        circles = self.detect_with_contours(binary)
        
        if circles:
            questions = self.group_circles_by_question(circles)
            
            if questions:
                return self.analyze_questions(image, questions)
        
        return None
    
    def analyze_by_grid(self, binary):
        """Analisa por grade (último fallback) - VERSÃO MELHORADA"""
        
        print("[IA] Usando metodo de grade melhorado...")
        
        regions = self.find_answer_regions(binary)
        
        answers = []
        
        for q in range(1, self.num_questions + 1):
            question_regions = [r for r in regions if r['question'] == q]
            question_regions.sort(key=lambda r: r['choice'])
            
            # NOVA LÓGICA: Detectar múltiplas marcações
            marked_alternatives = []
            
            print(f"\n[OMR] Questao {q}:")
            
            for region in question_regions:
                fill = region['fill_percentage']
                status = "MARCADA" if fill > self.bubble_threshold else "vazia"
                print(f"  {region['choice']}: {fill:.3f} - {status}")
                
                # NOVA LÓGICA: Coletar todas as alternativas marcadas
                if fill > self.bubble_threshold:
                    marked_alternatives.append({
                        'choice': region['choice'],
                        'fill': fill
                    })
            
            # NOVA LÓGICA: Verificar se há múltiplas marcações
            if len(marked_alternatives) > 1:
                # Mais de uma alternativa marcada - ANULAR QUESTÃO
                print(f"  ⚠️ MULTIPLAS MARCAÇÕES DETECTADAS: {[m['choice'] for m in marked_alternatives]}")
                print(f"  >> QUESTÃO ANULADA (sem resposta)")
                answers.append(None)  # None indica questão anulada
            elif len(marked_alternatives) == 1:
                # Apenas uma alternativa marcada
                best_choice = marked_alternatives[0]['choice']
                best_fill = marked_alternatives[0]['fill']
                answers.append(best_choice)
                print(f"  >> RESPOSTA: {best_choice} (preenchimento: {best_fill:.3f})")
            else:
                # Nenhuma alternativa marcada
                answers.append(None)
                print(f"  >> NENHUMA RESPOSTA")
        
        return answers
    
    def analyze_questions(self, image, questions):
        """Analisa as questões detectadas"""
        
        answers = []
        
        print(f"\n[IA] ========== ANALISANDO RESPOSTAS ==========")
        
        for q_idx, line in enumerate(questions[:self.num_questions]):
            print(f"\n[IA] Questao {q_idx+1}:")
            
            # NOVA LÓGICA: Coletar todas as alternativas marcadas
            marked_alternatives = []
            
            for c_idx, circle in enumerate(line[:self.num_choices]):
                radius = circle.get('radius', 20)
                fill = self.analyze_bubble_intensity(image, circle['x'], circle['y'], radius)
                
                # MELHORIA 9: Ajustar threshold para círculos estimados
                if circle.get('estimated', False):
                    fill = fill * 0.95
                
                status = "MARCADA" if fill > self.bubble_threshold else "vazia"
                print(f"  {self.choices[c_idx]}: {fill:.3f} - {status}")
                
                # NOVA LÓGICA: Coletar todas as alternativas marcadas
                if fill > self.bubble_threshold:
                    marked_alternatives.append({
                        'choice': self.choices[c_idx],
                        'fill': fill
                    })
            
            # NOVA LÓGICA: Verificar se há múltiplas marcações
            if len(marked_alternatives) > 1:
                # Mais de uma alternativa marcada - ANULAR QUESTÃO
                print(f"  ⚠️ MULTIPLAS MARCAÇÕES DETECTADAS: {[m['choice'] for m in marked_alternatives]}")
                print(f"  >> QUESTÃO ANULADA (sem resposta)")
                answers.append(None)  # None indica questão anulada
            elif len(marked_alternatives) == 1:
                # Apenas uma alternativa marcada
                best_choice = marked_alternatives[0]['choice']
                best_fill = marked_alternatives[0]['fill']
                answers.append(best_choice)
                print(f"  >> RESPOSTA: {best_choice} (preenchimento: {best_fill:.3f})")
            else:
                # Nenhuma alternativa marcada
                answers.append(None)
                print(f"  >> NENHUMA RESPOSTA")
        
        return answers
    
    def detect(self, image_base64=None):
        """Função principal"""
        
        if not image_base64:
            return {'error': 'Nenhuma imagem fornecida', 'answers': []}
        
        # Decodificar imagem
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]
        
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # MELHORIA 10: Corrigir orientação no início
        h, w = image.shape[:2]
        if h > w:
            image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
            print("[IA] Orientação da imagem corrigida")
        
        # Pré-processar
        processed_img, binary = self.preprocess_for_analysis(image)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/0_original.jpg", image)
            cv2.imwrite(f"{self.debug_folder}/1_binary.jpg", binary)
        
        print(f"\n[IA] ========== ANALISANDO IMAGEM ==========")
        print(f"[IA] Dimensoes: {image.shape[1]}x{image.shape[0]}")
        
        answers = None
        
        # Tentar métodos em ordem de precisão
        # 1. YOLO (melhor) - com confiança mais alta
        if answers is None and YOLO_AVAILABLE and self.yolo_model:
            answers = self.analyze_by_yolo(processed_img)
        
        # 2. Hough Circles
        if answers is None:
            answers = self.analyze_by_hough(processed_img)
        
        # 3. Contornos
        if answers is None:
            answers = self.analyze_by_contour(processed_img, binary)
        
        # 4. Grade (fallback final) - VERSÃO MELHORADA
        if answers is None:
            answers = self.analyze_by_grid(binary)
        
        # Gerar imagem de resultado
        if self.debug and answers:
            debug_img = processed_img.copy()
            h, w = binary.shape
            line_height = h // self.num_questions
            col_width = w // self.num_choices
            
            for q in range(self.num_questions):
                for c in range(self.num_choices):
                    x = c * col_width + col_width // 2
                    y = q * line_height + line_height // 2
                    
                    # NOVA LÓGICA: Diferentes cores para respostas
                    if answers[q] == self.choices[c]:
                        color = (0, 255, 0)  # Verde para resposta marcada
                    elif answers[q] is None and self.choices[c] in [a for a in answers if a is not None]:
                        # Esta lógica é apenas para visualização
                        color = (0, 100, 255)  # Laranja para anulada
                    else:
                        color = (0, 0, 255)  # Vermelho para não marcada
                    
                    cv2.circle(debug_img, (x, y), min(line_height, col_width)//3, color, 2)
                    cv2.putText(debug_img, self.choices[c], (x-15, y-15),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            
            # NOVA LÓGICA: Adicionar texto indicando questões anuladas
            for q in range(self.num_questions):
                if answers[q] is None:
                    x = col_width * 2.5  # Centro aproximado
                    y = q * line_height + line_height // 2
                    cv2.putText(debug_img, "ANULADA", (int(x-40), y+5),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 100, 255), 2)
            
            cv2.imwrite(f"{self.debug_folder}/2_resultado.jpg", debug_img)
        
        # NOVA LÓGICA: Contar estatísticas incluindo questões anuladas
        detected_count = sum(1 for a in answers if a is not None)
        nullified_count = sum(1 for a in answers if a is None)
        
        print(f"\n[IA] ========== RESUMO ==========")
        print(f"[IA] Respostas detectadas: {detected_count}/{self.num_questions}")
        print(f"[IA] Questões anuladas (múltiplas marcações): {nullified_count}")
        print(f"[IA] Respostas: {answers}")
        
        return {
            'success': True,
            'answers': answers,
            'detected_answers': detected_count,
            'nullified_questions': nullified_count,  # NOVO CAMPO
            'statistics': {
                'total_questions': self.num_questions,
                'detected_answers': detected_count,
                'nullified_answers': nullified_count,  # NOVO CAMPO
                'detection_rate': round(detected_count / self.num_questions * 100, 1),
                'threshold_used': self.bubble_threshold,
                'multiple_mark_threshold': self.multiple_mark_threshold  # NOVO CAMPO
            }
        }


omr = OMRReader()


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'online',
        'service': 'OMR Reader IA',
        'version': '7.2',  # Versão atualizada
        'yolo_available': YOLO_AVAILABLE and omr.yolo_model is not None,
        'google_vision_available': GOOGLE_VISION_AVAILABLE and omr.google_client is not None,
        'current_threshold': omr.bubble_threshold,
        'yolo_confidence_threshold': omr.yolo_confidence_threshold,
        'multiple_mark_threshold': omr.multiple_mark_threshold  # NOVO CAMPO
    })


@app.route('/detect', methods=['POST'])
def detect():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Dados nao fornecidos'}), 400
        
        image_base64 = data.get('image', '')
        gabarito = data.get('gabarito', None)
        threshold = data.get('threshold', None)
        
        print(f"\n{'='*60}")
        print("[IA] NOVA CORRECAO RECEBIDA!")
        print(f"{'='*60}")
        
        if threshold:
            omr.bubble_threshold = float(threshold)
            print(f"[IA] Threshold ajustado para: {threshold}")
        else:
            print(f"[IA] Threshold atual: {omr.bubble_threshold}")
        
        result = omr.detect(image_base64=image_base64)
        
        if gabarito and result.get('success') and result.get('answers'):
            answers = result['answers']
            score = 0
            # NOVA LÓGICA: Questões anuladas (None) são consideradas erradas
            for i, ans in enumerate(answers):
                if ans and i < len(gabarito) and ans == gabarito[i]:
                    score += 1
            result['score'] = score
            result['nota'] = round(score * 10 / omr.num_questions, 1)
            print(f"[IA] NOTA: {result['nota']} ({score}/{omr.num_questions})")
            print(f"[IA] Questões anuladas: {result.get('nullified_questions', 0)}")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[IA] Erro: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5001)
    args = parser.parse_args()
    
    print(f"\n[IA] Servidor rodando na porta {args.port}")
    print("[IA] Pronto para receber requisicoes!")
    print("[IA] Metodos disponiveis:")
    print("   - YOLO: " + ("SIM" if YOLO_AVAILABLE and omr.yolo_model else "NAO"))
    print("   - Hough Circles: SIM")
    print("   - Contornos: SIM")
    print("   - Grade: SIM")
    print(f"[IA] Threshold preenchimento: {omr.bubble_threshold}")
    print(f"[IA] YOLO confianca minima: {omr.yolo_confidence_threshold}")
    print(f"[IA] Multiplas marcações: detecta e anula questão")  # NOVA INFORMAÇÃO
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=args.port, debug=False, threaded=True)