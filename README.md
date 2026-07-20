<div align="center">

# 🤟 Tradutor de Libras — TCC Protótipo

**Reconhecimento do Alfabeto de Libras por Visão Computacional com IA**

![Tecnologias](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Tecnologias](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Tecnologias](https://img.shields.io/badge/MediaPipe-Hands-34A853?style=flat-square&logo=google)
![Tecnologias](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)
![Tecnologias](https://img.shields.io/badge/Gemini_AI-API-4285F4?style=flat-square&logo=google)

</div>

---

## 📖 O que é este projeto?

Este é o protótipo do TCC (Trabalho de Conclusão de Curso) de um **Tradutor de Libras** baseado em visão computacional. A aplicação usa a câmera do computador para detectar e reconhecer as letras do **Alfabeto de Libras (Língua Brasileira de Sinais)** em tempo real, sem precisar instalar nenhum software adicional — tudo roda diretamente no navegador.

O objetivo é tornar a comunicação mais acessível, permitindo que qualquer pessoa com uma webcam consiga ver suas letras em Libras sendo identificadas instantaneamente.

---

## ✨ Funcionalidades

### 📷 Aba: Tradutor
- Acessa a câmera do computador via webcam
- Detecta a mão em tempo real usando **Google MediaPipe Hands** (21 pontos de referência por mão)
- Reconhece as letras do alfabeto de Libras e exibe a letra detectada com índice de confiança
- **Construtor de palavras automático**: mantém a mão parada por ~1 segundo para adicionar a letra à palavra
- Leitura em voz alta (Text-to-Speech) a cada letra adicionada
- Exibe FPS (frames por segundo) em tempo real
- Sobreposição visual do esqueleto da mão sobre o vídeo (estilo verde esmeralda)

### 🏆 Aba: Praticar
- Modo de jogo/exercício onde o sistema sorteia uma letra do alfabeto
- O usuário tenta fazer o sinal correto na câmera
- Sistema de pontuação com score e sequência (streak)
- Dicas inteligentes e contextuais exibidas conforme o gesto detectado
- Feedback por voz ao acertar a letra

### 📚 Aba: Dicionário
- Catálogo completo do alfabeto de Libras (A–Z)
- Descrição textual de como realizar cada sinal
- Dicas práticas para cada letra

### 🔬 Aba: Lab TCC (KNN)
- Modo avançado para calibração personalizada do classificador
- Permite capturar amostras da própria mão para cada letra (algoritmo KNN — K-Nearest Neighbors)
- Exportar e importar a base de dados de calibração (arquivo JSON)
- Restaurar para a base de dados padrão pré-treinada

---

## 🧠 Como o sistema funciona?

```
Webcam → MediaPipe Hands → 21 Landmarks (coordenadas XYZ) → Classificador → Letra Detectada
```

1. **Captura**: A câmera captura o vídeo em tempo real
2. **Detecção de mão**: O [MediaPipe Hands](https://mediapipe.readthedocs.io/en/latest/solutions/hands.html) identifica 21 pontos de referência (landmarks) da mão (juntas, ponta dos dedos, pulso)
3. **Classificação**: Dois classificadores disponíveis:
   - **Heurístico** (padrão): Regras matemáticas baseadas em ângulos, distâncias e razões entre os pontos da mão. Funciona sem treinamento.
   - **KNN** (Lab TCC): Classificador por vizinhos mais próximos treinado com amostras capturadas pelo usuário
4. **Resultado**: A letra reconhecida e o nível de confiança são exibidos na tela

---

## 🗂️ Estrutura do Projeto

```
tradutor-de-libras-tcc/
│
├── src/
│   ├── App.tsx          # Componente principal — interface completa com todas as abas e lógica de câmera
│   ├── classifier.ts    # Motor de reconhecimento de gestos (heurístico + KNN)
│   ├── dictionary.ts    # Base de dados do alfabeto de Libras com descrições e dicas
│   ├── types.ts         # Definições de tipos TypeScript (Landmark, LetterReference)
│   ├── main.tsx         # Ponto de entrada da aplicação React
│   └── index.css        # Estilos globais
│
├── assets/              # Imagens e recursos estáticos
├── index.html           # Template HTML principal
├── vite.config.ts       # Configuração do bundler Vite
├── tsconfig.json        # Configuração do TypeScript
├── package.json         # Dependências e scripts do projeto
├── .env.example         # Modelo do arquivo de variáveis de ambiente
└── README.md            # Este arquivo
```

---

## 🚀 Como rodar o projeto

### Pré-requisitos

Antes de começar, você vai precisar ter instalado:

- **[Node.js](https://nodejs.org/)** (versão 18 ou superior)
  - Acesse https://nodejs.org/, baixe e instale a versão **LTS**
  - Para verificar se já está instalado, abra o terminal e digite: `node --version`

- **Uma chave de API do Google Gemini** (gratuita)
  - Acesse: https://aistudio.google.com/app/apikey
  - Faça login com sua conta Google
  - Clique em **"Create API key"** e copie a chave gerada

---

### Opção 1 — Baixar o ZIP (sem Git)

1. Acesse o repositório no GitHub e clique em **Code → Download ZIP**
2. Extraia o arquivo ZIP em uma pasta do seu computador
3. Abra o terminal (Prompt de Comando ou PowerShell) e **navegue até a pasta extraída**:
   ```bash
   cd caminho/para/a/pasta/tradutor-de-libras-tcc
   ```
4. Siga os passos da seção **"Configuração e execução"** abaixo

---

### Opção 2 — Clonar com Git

Se você tiver o [Git](https://git-scm.com/) instalado:

```bash
git clone https://github.com/SEU_USUARIO/tradutor-de-libras-tcc.git
cd tradutor-de-libras-tcc
```

---

### ⚙️ Configuração e execução

Após baixar ou clonar o projeto, siga estes passos **dentro da pasta do projeto**:

**1. Instale as dependências:**
```bash
npm install
```

**2. Crie o arquivo `.env` com sua chave de API:**

Crie um arquivo chamado `.env` na raiz do projeto (mesma pasta do `package.json`) com o seguinte conteúdo:

```
GEMINI_API_KEY="SUA_CHAVE_AQUI"
APP_URL="http://localhost:3000"
```

> ⚠️ Substitua `SUA_CHAVE_AQUI` pela chave que você obteve no Google AI Studio.  
> O arquivo `.env` **não é enviado ao GitHub** (está no `.gitignore`) para proteger sua chave de API.

**3. Inicie o servidor de desenvolvimento:**
```bash
npm run dev
```

**4. Abra no navegador:**

Acesse **http://localhost:3000** no seu navegador (Chrome ou Edge recomendados).

---

### 🎥 Permissão de câmera

Quando acessar o aplicativo pela primeira vez, o navegador pedirá permissão para usar a câmera. **Clique em "Permitir"**.

> 💡 Se a câmera não funcionar, certifique-se de acessar via `http://localhost:3000` (não abra o arquivo HTML diretamente).

---

## 🛠️ Tecnologias utilizadas

| Tecnologia | Uso |
|---|---|
| [React 19](https://react.dev/) | Interface do usuário |
| [TypeScript](https://www.typescriptlang.org/) | Tipagem estática |
| [Vite 6](https://vitejs.dev/) | Bundler e servidor de desenvolvimento |
| [TailwindCSS 4](https://tailwindcss.com/) | Estilização |
| [MediaPipe Hands](https://mediapipe.readthedocs.io/) | Detecção de mão e landmarks |
| [Framer Motion](https://www.framer.com/motion/) | Animações da interface |
| [Lucide React](https://lucide.dev/) | Ícones |
| [Google Gemini API](https://ai.google.dev/) | Integração com IA generativa |

---

## 📝 Observações

- O projeto funciona totalmente **offline** após carregado — a IA de detecção de mão (MediaPipe) roda no próprio navegador, sem enviar vídeo para a internet
- A chave da API Gemini é necessária apenas para funcionalidades que usam IA generativa
- Testado nos navegadores **Google Chrome** e **Microsoft Edge**
- Para melhor resultado, use em um ambiente com **boa iluminação** e fundo sem muita bagunça

---

<div align="center">
Feito com 💚 como Trabalho de Conclusão de Curso
</div>
