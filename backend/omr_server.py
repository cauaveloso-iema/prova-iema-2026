#!/usr/bin/env python3
"""
OMR Reader Server - Leitor de Cartão-Resposta IEMA
Detecção real de círculos preenchidos com visualização de resultados
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
from flask import Flask, request, jsonify, send_file
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
print("=" * 60)

class OMRReader:
    def __init__(self):
        # Configuração padrão (10 questões, 5 alternativas)
        self.num_questions = 10
        self.num_choices = 5
        self.choices = ['A', 'B', 'C', 'D', 'E']
        
        # 🔥 CONFIGURAÇÕES OTIMIZADAS PARA MÁXIMA PRECISÃO
        self.bubble_threshold = 0.20      # 20% de preenchimento = marcado (mais sensível)
        self.contour_min_area = 30        # Área mínima da bolinha (captura bolinhas pequenas)
        self.contour_max_area = 550       # Área máxima da bolinha (tolerância para bolinhas maiores)
        
        # 🔥 CONFIGURAÇÕES DE PRÉ-PROCESSAMENTO (calibradas para EVALBE)
        self.blur_kernel = (3, 3)         # Kernel do blur (suave)
        self.adaptive_block = 13          # Tamanho do bloco (ímpar, 13 é ideal)
        self.adaptive_c = 3               # Constante da binarização (3 para melhor detecção)
        
        # 🔥 NOVOS PARÂMETROS PARA MAIOR PRECISÃO
        self.circularity_min = 0.48       # Circularidade mínima (0.48 aceita bolinhas ligeiramente ovais)
        self.bubble_filled_threshold = 0.65  # Acima disso é definitivamente marcado
        self.bubble_empty_threshold = 0.10   # Abaixo disso é definitivamente vazio
        
        # Debug mode
        self.debug = True
        self.debug_folder = "debug_omr"
        
        if self.debug and not os.path.exists(self.debug_folder):
            os.makedirs(self.debug_folder)
        
        # Cores para visualização
        self.COLOR_GREEN = (0, 255, 0)
        self.COLOR_RED = (0, 0, 255)
        self.COLOR_BLUE = (255, 0, 0)
        self.COLOR_YELLOW = (0, 255, 255)
        self.COLOR_ORANGE = (0, 165, 255)
    
    def preprocess_image(self, image):
        """Pré-processamento da imagem para melhorar detecção"""
        # Converter para escala de cinza
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/1_gray.jpg", gray)
        
        # 🔥 Aplicar CLAHE para melhorar contraste (ajuda em iluminação ruim)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/1a_clahe.jpg", gray)
        
        # Aplicar blur para reduzir ruído
        blurred = cv2.GaussianBlur(gray, self.blur_kernel, 0)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/2_blurred.jpg", blurred)
        
        # 🔥 Binarização adaptativa com parâmetros calibrados
        binary = cv2.adaptiveThreshold(blurred, 255,
                                       cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY_INV, 
                                       self.adaptive_block, 
                                       self.adaptive_c)
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/3_binary.jpg", binary)
        
        # 🔥 Operação morfológica para fechar pequenos buracos
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
            
            # Filtrar por área
            if self.contour_min_area < area < self.contour_max_area:
                (x, y), radius = cv2.minEnclosingCircle(c)
                center = (int(x), int(y))
                radius = int(radius)
                
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter * perimeter)
                    # 🔥 Aceitar bolinhas com circularidade > 0.48 (mais tolerante)
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
                cv2.circle(debug_img, b['center'], b['radius'], self.COLOR_YELLOW, 2)
            cv2.imwrite(f"{self.debug_folder}/5_bubbles_detected.jpg", debug_img)
        
        return bubbles
    
    def group_by_question(self, bubbles):
        """Agrupa bolinhas por questão (5 bolinhas por questão)"""
        expected_total = self.num_questions * self.num_choices
        
        if len(bubbles) != expected_total:
            print(f"[OMR] Aviso: Esperado {expected_total} bolinhas, encontrado {len(bubbles)}")
            
            # 🔥 TENTAR AGRUPAR POR LINHAS (ideal para EVALBE)
            if len(bubbles) >= 40:
                y_positions = [b['center'][1] for b in bubbles]
                y_unique = sorted(set(y_positions))
                
                # Agrupar Y's próximos
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
                
                if len(y_clusters) >= 4:
                    rows = []
                    for y_center in y_clusters:
                        row_bubbles = [b for b in bubbles if abs(b['center'][1] - y_center) < 20]
                        if len(row_bubbles) >= self.num_choices:
                            rows.append(sorted(row_bubbles, key=lambda b: b['center'][0]))
                    
                    if len(rows) >= self.num_choices:
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
    
    def generate_debug_image(self, original_image, questions, answers, gabarito=None):
        """Gera imagem de debug com resultados visuais"""
        debug_img = original_image.copy()
        
        # 🔥 Adicionar legenda mais informativa
        legend_y = 30
        legend_x = 10
        cv2.rectangle(debug_img, (legend_x - 5, legend_y - 20), (legend_x + 210, legend_y + 80), (50, 50, 50), -1)
        cv2.putText(debug_img, "LEGENDA:", (legend_x, legend_y),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(debug_img, "VERDE = Acertou", (legend_x, legend_y + 20),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_GREEN, 1)
        cv2.putText(debug_img, "VERMELHO = Errou", (legend_x, legend_y + 35),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_RED, 1)
        cv2.putText(debug_img, "AZUL = Gabarito", (legend_x, legend_y + 50),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_BLUE, 1)
        cv2.putText(debug_img, "AMARELO = Marcada", (legend_x, legend_y + 70),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_YELLOW, 1)
        
        for q_idx, question_bubbles in enumerate(questions):
            if q_idx >= len(answers):
                break
            
            answer = answers[q_idx]
            
            # Se tiver gabarito, compara para mostrar correção
            is_correct = False
            if gabarito and answer:
                is_correct = (answer == gabarito[q_idx])
            
            for c_idx, bubble in enumerate(question_bubbles):
                if c_idx >= self.num_choices:
                    break
                
                center = bubble['center']
                radius = bubble['radius']
                
                # Analisar preenchimento real
                fill_ratio = self.analyze_bubble(bubble, self.binary_image)
                is_marked = fill_ratio > self.bubble_threshold
                
                # 🔥 Definir cor baseado no resultado (mais informativo)
                if self.choices[c_idx] == answer:
                    if is_correct:
                        color = self.COLOR_GREEN      # Acertou!
                    else:
                        color = self.COLOR_RED        # Errou
                elif gabarito and self.choices[c_idx] == gabarito[q_idx]:
                    color = self.COLOR_BLUE           # Resposta correta (não marcada)
                elif is_marked:
                    color = self.COLOR_YELLOW         # Marcada mas não é a escolhida
                else:
                    color = (100, 100, 100)           # Alternativa não marcada
                
                cv2.circle(debug_img, center, radius, color, 3)
                
                # Adicionar texto da alternativa
                cv2.putText(debug_img, self.choices[c_idx],
                           (center[0] - 15, center[1] - 15),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                
                # 🔥 Mostrar percentual de preenchimento (para debug)
                fill_text = f"{int(fill_ratio * 100)}%"
                cv2.putText(debug_img, fill_text,
                           (center[0] - 10, center[1] + radius + 10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.35, (180, 180, 180), 1)
            
            # Adicionar número da questão
            if question_bubbles:
                first_bubble = question_bubbles[0]
                x = first_bubble['center'][0] - 30
                y = first_bubble['center'][1] - 20
                cv2.putText(debug_img, f"Q{q_idx + 1}", (x, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, self.COLOR_YELLOW, 2)
                
                # 🔥 Mostrar resposta detectada
                if answer:
                    cv2.putText(debug_img, f"Resp: {answer}", 
                               (first_bubble['center'][0] - 20, first_bubble['center'][1] + radius + 25),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.4, self.COLOR_ORANGE, 1)
        
        return debug_img
    
    def detect(self, image_base64=None, gabarito=None):
        """Função principal de detecção"""
        if not image_base64:
            return {'error': 'Nenhuma imagem fornecida', 'answers': []}
        
        # Decodificar imagem
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]
        
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        original = image.copy()
        
        # Redimensionar para tamanho padrão (ajuda na detecção)
        scale = min(1400 / image.shape[1], 1)
        if scale < 1:
            new_width = int(image.shape[1] * scale)
            new_height = int(image.shape[0] * scale)
            image = cv2.resize(image, (new_width, new_height))
        
        if self.debug:
            cv2.imwrite(f"{self.debug_folder}/0_original.jpg", image)
            print(f"[OMR] Imagem: {image.shape[1]}x{image.shape[0]}")
        
        # Pré-processar
        binary = self.preprocess_image(image)
        self.binary_image = binary  # Salvar para uso posterior
        
        # Detectar bolinhas
        bubbles = self.detect_bubbles(binary, image)
        
        if len(bubbles) == 0:
            return {
                'success': False,
                'error': 'Nenhuma bolinha detectada. Verifique a iluminação e o posicionamento.',
                'answers': [],
                'detected_bubbles': 0
            }
        
        print(f"[OMR] Detectadas {len(bubbles)} bolinhas")
        
        # Agrupar por questão
        questions = self.group_by_question(bubbles)
        
        if not questions:
            return {
                'success': False,
                'error': f'Falha ao agrupar bolinhas. Detectadas {len(bubbles)} bolinhas.',
                'answers': [],
                'detected_bubbles': len(bubbles)
            }
        
        print(f"[OMR] Agrupadas em {len(questions)} questões")
        
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
                    'fill_ratio': round(fill_ratio, 3),
                    'is_marked': fill_ratio > self.bubble_threshold
                })
                
                # 🔥 Usar threshold mais sensível para melhor detecção
                if fill_ratio > self.bubble_threshold and fill_ratio > best_fill:
                    best_fill = fill_ratio
                    best_choice = self.choices[c_idx]
            
            answers.append(best_choice if best_choice else None)
        
        # Gerar imagem de debug com resultados
        debug_img = self.generate_debug_image(original, questions, answers, gabarito)
        cv2.imwrite(f"{self.debug_folder}/6_result.jpg", debug_img)
        
        # Converter para base64 para enviar ao frontend
        _, buffer = cv2.imencode('.jpg', debug_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        debug_base64 = base64.b64encode(buffer).decode('utf-8')
        
        detected_count = sum(1 for a in answers if a is not None)
        
        # 🔥 Calcular nota se tiver gabarito
        score = 0
        nota = None
        if gabarito and len(gabarito) == len(answers):
            for i, ans in enumerate(answers):
                if ans and ans == gabarito[i]:
                    score += 1
            nota = round(score * 10 / len(answers), 1) if answers else 0
            print(f"[OMR] Acertos: {score}/{len(answers)} (Nota: {nota})")
        
        return {
            'success': True,
            'answers': answers,
            'score': score if gabarito else None,
            'nota': nota if gabarito else None,
            'debug_info': debug_info,
            'debug_image': debug_base64,
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


# ========== ENDPOINTS ==========

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'online', 
        'service': 'OMR Reader IEMA', 
        'version': '2.1.0'
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
        gabarito = data.get('gabarito', None)  # Receber gabarito para comparação
        
        print(f"[OMR] Recebida imagem de {len(image_base64)} caracteres")
        print(f"[OMR] Config: {questions} questoes, {choices} alternativas")
        
        # Atualizar configurações
        if questions != 10:
            omr.num_questions = int(questions)
        if choices != 5:
            omr.num_choices = int(choices)
            omr.choices = ['A', 'B', 'C', 'D', 'E'][:omr.num_choices]
        if 'threshold' in data:
            omr.bubble_threshold = float(data['threshold'])
        
        # Processar imagem
        result = omr.detect(image_base64=image_base64, gabarito=gabarito)
        
        print(f"[OMR] Detecção concluída: {result.get('detected_answers', 0)}/{questions} respostas")
        if result.get('nota') is not None:
            print(f"[OMR] Nota calculada: {result['nota']}")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[OMR] Erro: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/debug-image/<filename>', methods=['GET'])
def get_debug_image(filename):
    """Retorna uma imagem de debug"""
    filepath = os.path.join(omr.debug_folder, filename)
    if os.path.exists(filepath):
        return send_file(filepath, mimetype='image/jpeg')
    return jsonify({'error': 'Imagem não encontrada'}), 404


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