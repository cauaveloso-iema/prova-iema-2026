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
        
        # Redimensionar para tamanho padrão
        height = 1000
        scale = height / image.shape[0]
        new_width = int(image.shape[1] * scale)
        image = cv2.resize(image, (new_width, height))
        
        # Converter para tons de cinza
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Aumentar contraste
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # Binarização com Otsu
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
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
            circles = cv2.HoughCircles(
                gray, 
                cv2.HOUGH_GRADIENT, 
                dp=1, 
                minDist=30,
                param1=50, 
                param2=30, 
                minRadius=10, 
                maxRadius=50
            )
            
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
            if 50 < area < 5000:
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter * perimeter)
                    if circularity > 0.3:
                        (x, y), radius = cv2.minEnclosingCircle(c)
                        circles.append({
                            'x': int(x),
                            'y': int(y),
                            'radius': int(radius),
                            'area': area
                        })
        
        return circles if circles else None
    
    def group_circles_by_question(self, circles):
        """Agrupa círculos por questão"""
        
        if not circles or len(circles) < 20:
            return None
        
        circles.sort(key=lambda c: c['y'])
        
        questions = []
        current_line = []
        last_y = circles[0]['y']
        
        for c in circles:
            if abs(c['y'] - last_y) < 50:
                current_line.append(c)
            else:
                if current_line:
                    current_line.sort(key=lambda c: c['x'])
                    questions.append(current_line[:self.num_choices])
                current_line = [c]
                last_y = c['y']
        
        if current_line:
            current_line.sort(key=lambda c: c['x'])
            questions.append(current_line[:self.num_choices])
        
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
        """Encontra as regiões das respostas (método de grade)"""
        
        h, w = binary.shape
        
        # Dividir em 10 linhas (questões)
        line_height = h // self.num_questions
        
        # Dividir em 5 colunas (alternativas)
        col_width = w // self.num_choices
        
        regions = []
        
        for q in range(self.num_questions):
            y_start = q * line_height
            y_end = (q + 1) * line_height
            
            for c in range(self.num_choices):
                x_start = c * col_width
                x_end = (c + 1) * col_width
                
                # Extrair região
                roi = binary[y_start:y_end, x_start:x_end]
                
                # Calcular porcentagem de pixels pretos
                total_pixels = roi.size
                black_pixels = np.sum(roi > 0)
                fill_percentage = black_pixels / total_pixels if total_pixels > 0 else 0
                
                regions.append({
                    'question': q + 1,
                    'choice': self.choices[c],
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
        """Analisa por grade (último fallback)"""
        
        print("[IA] Usando metodo de grade...")
        
        regions = self.find_answer_regions(binary)
        
        answers = []
        
        for q in range(1, self.num_questions + 1):
            question_regions = [r for r in regions if r['question'] == q]
            question_regions.sort(key=lambda r: r['choice'])
            
            best_choice = None
            best_fill = 0
            
            print(f"\n[OMR] Questao {q}:")
            
            for region in question_regions:
                fill = region['fill_percentage']
                status = "MARCADA" if fill > self.bubble_threshold else "vazia"
                print(f"  {region['choice']}: {fill:.3f} - {status}")
                
                if fill > self.bubble_threshold and fill > best_fill:
                    best_fill = fill
                    best_choice = region['choice']
            
            answers.append(best_choice)
            
            if best_choice:
                print(f"  >> RESPOSTA: {best_choice} (preenchimento: {best_fill:.3f})")
            else:
                print(f"  >> NENHUMA RESPOSTA")
        
        return answers
    
    def analyze_questions(self, image, questions):
        """Analisa as questões detectadas"""
        
        answers = []
        
        print(f"\n[IA] ========== ANALISANDO RESPOSTAS ==========")
        
        for q_idx, line in enumerate(questions[:self.num_questions]):
            print(f"\n[IA] Questao {q_idx+1}:")
            
            best_choice = None
            best_fill = 0
            
            for c_idx, circle in enumerate(line[:self.num_choices]):
                radius = circle.get('radius', 20)
                fill = self.analyze_bubble_intensity(image, circle['x'], circle['y'], radius)
                
                status = "MARCADA" if fill > self.bubble_threshold else "vazia"
                print(f"  {self.choices[c_idx]}: {fill:.3f} - {status}")
                
                if fill > self.bubble_threshold and fill > best_fill:
                    best_fill = fill
                    best_choice = self.choices[c_idx]
            
            answers.append(best_choice)
            
            if best_choice:
                print(f"  >> RESPOSTA: {best_choice} (preenchimento: {best_fill:.3f})")
            else:
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
        
        # 4. Grade (fallback final)
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
                    color = (0, 255, 0) if answers[q] == self.choices[c] else (0, 0, 255)
                    cv2.circle(debug_img, (x, y), min(line_height, col_width)//3, color, 2)
                    cv2.putText(debug_img, self.choices[c], (x-15, y-15),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            
            cv2.imwrite(f"{self.debug_folder}/2_resultado.jpg", debug_img)
        
        detected_count = sum(1 for a in answers if a is not None)
        
        print(f"\n[IA] ========== RESUMO ==========")
        print(f"[IA] Respostas detectadas: {detected_count}/{self.num_questions}")
        print(f"[IA] Respostas: {answers}")
        
        return {
            'success': True,
            'answers': answers,
            'detected_answers': detected_count,
            'statistics': {
                'total_questions': self.num_questions,
                'detected_answers': detected_count,
                'detection_rate': round(detected_count / self.num_questions * 100, 1),
                'threshold_used': self.bubble_threshold
            }
        }


omr = OMRReader()


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'online',
        'service': 'OMR Reader IA',
        'version': '7.1',
        'yolo_available': YOLO_AVAILABLE and omr.yolo_model is not None,
        'google_vision_available': GOOGLE_VISION_AVAILABLE and omr.google_client is not None,
        'current_threshold': omr.bubble_threshold,
        'yolo_confidence_threshold': omr.yolo_confidence_threshold
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
            for i, ans in enumerate(answers):
                if ans and i < len(gabarito) and ans == gabarito[i]:
                    score += 1
            result['score'] = score
            result['nota'] = round(score * 10 / omr.num_questions, 1)
            print(f"[IA] NOTA: {result['nota']} ({score}/{omr.num_questions})")
        
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
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=args.port, debug=False, threaded=True)