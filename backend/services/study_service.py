from google import genai
from google.genai import types
import json

def generate_study_material(api_key, text, material_type, count, difficulty):
    """
    Calls the Gemini API to generate study materials based on the provided text.
    Migrated from deprecated google.generativeai to google.genai SDK.
    """
    # Configure the client with the provided API key
    client = genai.Client(api_key=api_key)

    # List available models and pick the best one
    available_models = []
    for m in client.models.list():
        if hasattr(m, 'supported_actions') and 'generateContent' in (m.supported_actions or []):
            available_models.append(m.name)
        elif hasattr(m, 'name') and 'gemini' in m.name.lower():
            available_models.append(m.name)

    # Prefer a flash model for fast JSON tasks
    selected_model_name = 'gemini-1.5-flash'  # sensible default
    for m_name in available_models:
        if 'flash' in m_name.lower():
            selected_model_name = m_name
            break
        elif available_models:
            selected_model_name = available_models[0]

    print(f"Dynamically selected Gemini Model: {selected_model_name}")

    # Define prompt templates based on material type
    prompts = {
        "MCQ": f"Generate {count} multiple-choice questions (MCQs) based on the text. Difficulty: {difficulty}. Provide 4 options per question. Respond ONLY with a valid JSON array of objects, where each object has 'question', 'options' (array of 4 strings), and 'answer' (the exact string of the correct option).",
        "Viva": f"Generate {count} oral Viva questions and concise answers based on the text. Difficulty: {difficulty}. Respond ONLY with a valid JSON array of objects, where each object has 'question' and 'answer'.",
        "Interview": f"Generate {count} technical interview questions and comprehensive answers based on the text. Difficulty: {difficulty}. Respond ONLY with a valid JSON array of objects, where each object has 'question' and 'answer'.",
        "2-Mark": f"Generate {count} short 2-mark questions and answers based on the text. Difficulty: {difficulty}. Respond ONLY with a valid JSON array of objects, where each object has 'question' and 'answer'.",
        "16-Mark": f"Generate {count} long-form 16-mark essay questions and detailed structural answers (with bullet points) based on the text. Difficulty: {difficulty}. Respond ONLY with a valid JSON array of objects, where each object has 'question' and 'answer'.",
        "Summary": f"Generate a highly structured summary of the text. Difficulty: {difficulty}. Include a main overview and key bullet points. Respond ONLY with a valid JSON object containing 'overview' (string) and 'key_points' (array of strings).",
        "Flashcard": f"Generate {count} flashcard question and answer pairs based on the text. Difficulty: {difficulty}. Respond ONLY with a valid JSON array of objects, where each object has 'question' and 'answer'.",
        "Podcast": f"Generate a highly engaging conversational podcast script based on the text. Difficulty: {difficulty}. The podcast features two hosts: 'Alex' (an inquisitive student asking questions) and 'Taylor' (a subject matter expert giving clear, insightful explanations). Respond ONLY with a valid JSON array of objects, where each object has 'speaker' ('Alex' or 'Taylor') and 'text' (the dialogue text). Make sure the content covers all primary concepts in the text and limit it to approximately {count * 2} total dialog exchanges."
    }

    if material_type not in prompts:
        raise ValueError(f"Invalid material type: {material_type}")

    system_prompt = "You are an expert AI tutor and study assistant. You must ONLY output raw JSON. Do not include markdown formatting like ```json or any conversational text."
    user_prompt = f"{prompts[material_type]}\n\nSource Text:\n{text}"

    try:
        response = client.models.generate_content(
            model=selected_model_name,
            contents=f"{system_prompt}\n\n{user_prompt}",
        )

        # Parse the JSON. Gemini might wrap it in ```json ... ``` markdown blocks.
        text_resp = response.text.strip()
        if text_resp.startswith("```"):
            lines = text_resp.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            text_resp = '\n'.join(lines).strip()

        return json.loads(text_resp)

    except Exception as e:
        print(f"Gemini API Error: {str(e)}")
        raise e
