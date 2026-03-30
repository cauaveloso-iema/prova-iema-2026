#!/usr/bin/env python3
"""
OMR Reader Server - Leitor de Cartão-Resposta IEMA
Formato: 10 questões x 5 alternativas (A-E)
Grade: questões na vertical, alternativas na horizontal
"""

import sys
import argparse
import os
import base64
import io
import numpy as np
import cv2
import imutils
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

# Configurar encoding para UTF-8 no Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

app = Flask(__name__)
CORS(app)

print("=" * 60)
print("[OMR] OMR Reader Server - Leitor de Cartão-Resposta IEMA")
print("[OMR] Formato: 10 questões x 5 alternativas (A-E)")
print("[OMR] Grade: questões na vertical, alternativas na horizontal")
print("=" * 60)

class OMRReader:
    def __init__(self):
        # Configuração padrão (10 questões, 5 alternativas)
        self.num_questions = 10
        self.num_choices = 5
        self.choices = ['A', 'B', 'C', 'D', 'E']
        
        # 🔥 PARÂMETROS OTIMIZADOS PARA DETECTAR CÍRCULOS
        self.bubble_threshold = 0.12      # 12% de preenchimento = marcado
        self.contour_min_area = 18        # Área mínima do círculo (mais sensível)
        self.contour_max_area = 800       # Área máxima do círculo
        self.circularity_min = 0.40       # Circularidade mínima (mais tolerante)
        
        # Configurações de pré-processamento
        self.blur_kernel = (3, 3)
        self.adaptive_block = 11
        self.adaptive_c = 2
        
        # Debug mode
        self.debug = True
        self.debug_folder = "debug_omr"
        
        if self.debug and not os.path.exists(self.debug_folder):
            os.makedirs(self.debug_folder)
    
    def preprocess_image(self, image):
        """Pré-processamento da imagem para melhorar detecção"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/1_gray.jpg", gray)
        
        # Aplicar CLAHE para melhorar contraste
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/1a_clahe.jpg", gray)
        
        blurred = cv2.GaussianBlur(gray, self.blur_kernel, 0)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/2_blurred.jpg", blurred)
        
        binary = cv2.adaptiveThreshold(blurred, 255,
                                       cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY_INV, 
                                       self.adaptive_block, 
                                       self.adaptive_c)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/3_binary.jpg", binary)
        
        kernel = np.ones((2, 2), np.uint8)
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/4_closed.jpg", closed)
        
        return closed
    
    def detect_bubbles(self, binary_image, original_image):
        """Detecta todas as bolinhas no cartão"""
        cnts = cv2.findContours(binary_image.copy(), cv2.RETR_EXTERNAL,
                                cv2.CHAIN_APPROX_SIMPLE)
        cnts = imutils.grab_contours(cnts)
        
        bubbles = []
        
        for c in cnts:
            area = cv2.contourArea(c)
            
            if self.contour_min_area < area < self.contour_max_area:
                (x, y), radius = cv2.minEnclosingCircle(c)
                center = (int(x), int(y))
                radius = int(radius)
                
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter * perimeter)
                    if circularity > self.circularity_min:
                        bubbles.append({
                            'center': center,
                            'radius': radius,
                            'area': area,
                            'circularity': circularity
                        })
        
        bubbles.sort(key=lambda b: (b['center'][1], b['center'][0]))
        
        if self.debug:
            debug_img = original_image.copy()
            for b in bubbles:
                cv2.circle(debug_img, b['center'], b['radius'], (0, 255, 0), 2)
            cv2.imwrite(f"{self.debug_folder}/5_bubbles_detected.jpg", debug_img)
        
        return bubbles
    
    def group_by_question(self, bubbles):
        """Agrupa bolinhas por questão (5 bolinhas por questão)"""
        expected_total = self.num_questions * self.num_choices
        
        if len(bubbles) != expected_total:
            print(f"[OMR] Aviso: Esperado {expected_total} bolinhas, encontrado {len(bubbles)}")
            
            # Tentar agrupar por linhas (questões)
            if len(bubbles) >= 40:
                # Agrupar por posição Y (linhas)
                y_positions = [b['center'][1] for b in bubbles]
                y_unique = sorted(set(y_positions))
                
                # Formar clusters de Y (cada cluster é uma questão)
                y_clusters = []
                current = [y_unique[0]]
                for y in y_unique[1:]:
                    if y - current[-1] < 25:
                        current.append(y)
                    else:
                        y_clusters.append(sum(current) / len(current))
                        current = [y]
                if current:
                    y_clusters.append(sum(current) / len(current))
                
                print(f"[OMR] Linhas de questões detectadas: {len(y_clusters)}")
                
                if len(y_clusters) >= self.num_questions:
                    # Para cada linha, pegar as 5 bolinhas mais à esquerda
                    questions = []
                    for y_center in y_clusters[:self.num_questions]:
                        row_bubbles = [b for b in bubbles if abs(b['center'][1] - y_center) < 25]
                        row_bubbles.sort(key=lambda b: b['center'][0])
                        if len(row_bubbles) >= self.num_choices:
                            questions.append(row_bubbles[:self.num_choices])
                    
                    if len(questions) >= self.num_questions:
                        return questions[:self.num_questions]
        
        # Agrupamento padrão (sequencial)
        questions = []
        for i in range(0, len(bubbles), self.num_choices):
            if i + self.num_choices <= len(bubbles):
                question_bubbles = bubbles[i:i + self.num_choices]
                question_bubbles.sort(key=lambda b: b['center'][0])
                questions.append(question_bubbles)
        
        return questions
    
    def analyze_bubble(self, bubble, binary_image):
        """Analisa o preenchimento de uma bolinha"""
        center = bubble['center']
        radius = bubble['radius']
        
        mask = np.zeros(binary_image.shape, dtype=np.uint8)
        cv2.circle(mask, center, radius, 255, -1)
        
        masked = cv2.bitwise_and(binary_image, binary_image, mask=mask)
        
        total_pixels = np.sum(mask > 0)
        filled_pixels = np.sum(masked > 0)
        
        fill_ratio = filled_pixels / total_pixels if total_pixels > 0 else 0
        
        return fill_ratio
    
    def detect(self, image_base64=None):
        """Função principal de detecção"""
        if not image_base64:
            return {'error': 'Nenhuma imagem fornecida', 'answers': []}
        
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]
        
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        original = image.copy()
        
        # 🔥 NÃO REDIMENSIONAR TANTO - manter qualidade para detectar círculos
        max_width = 1400
        if image.shape[1] > max_width:
            scale = max_width / image.shape[1]
            new_width = int(image.shape[1] * scale)
            new_height = int(image.shape[0] * scale)
            image = cv2.resize(image, (new_width, new_height))
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/0_original.jpg", image)
            print(f"[OMR] Imagem: {image.shape[1]}x{image.shape[0]}")
        
        binary = self.preprocess_image(image)
        
        bubbles = self.detect_bubbles(binary, image)
        
        if len(bubbles) == 0:
            return {
                'success': False,
                'error': 'Nenhuma bolinha detectada. Verifique a iluminação e o posicionamento.',
                'answers': [],
                'detected_bubbles': 0
            }
        
        print(f"[OMR] Detectadas {len(bubbles)} bolinhas (esperado 50)")
        
        questions = self.group_by_question(bubbles)
        
        if not questions:
            return {
                'success': False,
                'error': f'Falha ao agrupar bolinhas. Detectadas {len(bubbles)} bolinhas.',
                'answers': [],
                'detected_bubbles': len(bubbles)
            }
        
        print(f"[OMR] Agrupadas em {len(questions)} questões (esperado {self.num_questions})")
        
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
        
        if self.debug:
            debug_img = original.copy()
            for q_idx, question_bubbles in enumerate(questions):
                if q_idx >= len(answers):
                    break
                answer = answers[q_idx]
                for c_idx, bubble in enumerate(question_bubbles):
                    if c_idx >= self.num_choices:
                        break
                    center = bubble['center']
                    radius = bubble['radius']
                    color = (0, 255, 0) if self.choices[c_idx] == answer else (0, 0, 255)
                    cv2.circle(debug_img, center, radius, color, 2)
                    cv2.putText(debug_img, self.choices[c_idx],
                               (center[0] - 10, center[1] - 10),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            cv2.imwrite(f"{self.debug_folder}/6_result.jpg", debug_img)
        
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


omr = OMRReader()


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'online', 
        'service': 'OMR Reader IEMA', 
        'version': '2.0.0'
    })


@app.route('/detect', methods=['POST'])
def detect():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Dados nao fornecidos'}), 400
        
        image_base64 = data.get('image', '')
        questions = data.get('questions', 10)
        choices = data.get('choices', 5)
        gabarito = data.get('gabarito', None)
        threshold = data.get('threshold', 0.12)
        
        print(f"[OMR] Recebida imagem de {len(image_base64)} caracteres")
        print(f"[OMR] Config: {questions} questoes, {choices} alternativas, threshold={threshold}")
        
        if questions != 10:
            omr.num_questions = int(questions)
        if choices != 5:
            omr.num_choices = int(choices)
            omr.choices = ['A', 'B', 'C', 'D', 'E'][:omr.num_choices]
        if threshold:
            omr.bubble_threshold = float(threshold)
        
        result = omr.detect(image_base64=image_base64)
        
        if gabarito and result.get('success') and result.get('answers'):
            answers = result['answers']
            score = 0
            for i, ans in enumerate(answers):
                if ans and i < len(gabarito) and ans == gabarito[i]:
                    score += 1
            result['score'] = score
            result['nota'] = round(score * 10 / len(answers), 1) if answers else 0
        
        print(f"[OMR] Detecção concluída: {result.get('detected_answers', 0)}/{questions} respostas")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[OMR] Erro: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/config', methods=['GET', 'POST'])
def config():
    global omr
    
    if request.method == 'GET':
        return jsonify({
            'num_questions': omr.num_questions,
            'num_choices': omr.num_choices,
            'choices': omr.choices,
            'bubble_threshold': omr.bubble_threshold,
            'contour_min_area': omr.contour_min_area,
            'contour_max_area': omr.contour_max_area
        })
    
    elif request.method == 'POST':
        data = request.get_json()
        
        if 'num_questions' in data:
            omr.num_questions = int(data['num_questions'])
        if 'num_choices' in data:
            omr.num_choices = int(data['num_choices'])
            omr.choices = ['A', 'B', 'C', 'D', 'E'][:omr.num_choices]
        if 'bubble_threshold' in data:
            omr.bubble_threshold = float(data['bubble_threshold'])
        if 'contour_min_area' in data:
            omr.contour_min_area = int(data['contour_min_area'])
        if 'contour_max_area' in data:
            omr.contour_max_area = int(data['contour_max_area'])
        
        return jsonify({'success': True, 'config': {
            'num_questions': omr.num_questions,
            'num_choices': omr.num_choices,
            'bubble_threshold': omr.bubble_threshold,
            'contour_min_area': omr.contour_min_area,
            'contour_max_area': omr.contour_max_area
        }})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5001)
    args = parser.parse_args()
    
    port = args.port
    
    print(f"[OMR] Servidor rodando na porta {port}")
    print("[OMR] Pronto para receber requisicoes!")
    print("=" * 60)
    
    sys.stdout.flush()
    
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)