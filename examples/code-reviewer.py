"""
Complete example: Building an AI-powered code reviewer with AgentOps tracking
"""

import agentops
from openai import OpenAI

# Initialize AgentOps
agentops.init(
    api_key="ao_your_api_key",  # Or use AGENTOPS_API_KEY env var
    debug=True,  # Enable for development
)

# Wrap your OpenAI client
client = agentops.wrap(OpenAI())

def review_code(code: str, language: str = "python") -> dict:
    """Review code for bugs, security issues, and best practices."""
    
    # Start a dedicated session for this review
    session = agentops.get_client().start_session(
        feature_id="code_review",
        tags=[language, "automated"],
        metadata={"code_length": len(code)},
    )
    
    try:
        # Step 1: Initial analysis
        analysis_response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": f"""You are an expert {language} code reviewer. 
                    Analyze code for:
                    1. Bugs and logic errors
                    2. Security vulnerabilities
                    3. Performance issues
                    4. Code style and best practices
                    
                    Be specific and actionable in your feedback."""
                },
                {
                    "role": "user",
                    "content": f"Please review this code:\n\n```{language}\n{code}\n```"
                }
            ],
            temperature=0.3,
        )
        
        analysis = analysis_response.choices[0].message.content
        
        # Step 2: Generate severity scores
        scoring_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """Based on the code review, provide scores from 1-10 for:
                    - security: How secure is the code?
                    - quality: Overall code quality
                    - maintainability: How maintainable is the code?
                    
                    Respond in JSON format: {"security": N, "quality": N, "maintainability": N}"""
                },
                {
                    "role": "user",
                    "content": f"Code review analysis:\n{analysis}"
                }
            ],
            response_format={"type": "json_object"},
        )
        
        import json
        scores = json.loads(scoring_response.choices[0].message.content)
        
        # End session successfully
        session.end(status="completed")
        
        return {
            "analysis": analysis,
            "scores": scores,
            "session_id": session.session_id,
        }
        
    except Exception as e:
        # Track the error and end session
        session.end(status="error", error_message=str(e))
        raise


def main():
    # Example code to review
    code_to_review = '''
def process_user_input(data):
    query = f"SELECT * FROM users WHERE id = {data['user_id']}"
    result = db.execute(query)
    
    password = data.get('password')
    if password:
        # Store password directly
        save_password(data['user_id'], password)
    
    return result
'''
    
    print("Reviewing code...")
    result = review_code(code_to_review, language="python")
    
    print("\n=== Code Review Results ===")
    print(f"\nAnalysis:\n{result['analysis']}")
    print(f"\nScores: {result['scores']}")
    print(f"\nSession ID: {result['session_id']}")
    print("\nView full trace at: https://app.agentops.dev/sessions/" + result['session_id'])


if __name__ == "__main__":
    main()
