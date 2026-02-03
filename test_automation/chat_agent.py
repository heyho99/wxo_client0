import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_access_token():
    """
    Retrieves an IAM access token from IBM Cloud.
    """
    url = "https://iam.cloud.ibm.com/identity/token"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
    }
    
    api_key = os.getenv("IBM_CLOUD_API_KEY")
    
    data = {
        "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
        "apikey": api_key
    }
    
    # Check if API Key is present
    if not api_key:
        print("Error: IBM_CLOUD_API_KEY is not set in .env file.")
        return None

    try:
        response = requests.post(url, headers=headers, data=data)
        response.raise_for_status()
        token_data = response.json()
        print("Access Token retrieved successfully.")
        return token_data.get("access_token")
    except requests.exceptions.RequestException as e:
        print(f"Error retrieving access token: {e}")
        if 'response' in locals() and response is not None:
             print(f"Response: {response.text}")
        return None

def send_chat_message(token, message_content):
    """
    Sends a chat message to the Watsonx Orchestrate agent.
    """
    instance_id = os.getenv("WXO_INSTANCE_ID")
    agent_id = os.getenv("WXO_AGENT_ID")
    api_host = os.getenv("WXO_API_HOST", "api.us-south.watson-orchestrate.cloud.ibm.com")

    if not instance_id or not agent_id:
        print("Error: WXO_INSTANCE_ID or WXO_AGENT_ID is not set in .env file.")
        return None

    url = f"https://{api_host}/instances/{instance_id}/v1/orchestrate/{agent_id}/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    payload = {
        "messages": [
            {
                "role": "user",
                "content": message_content
            }
        ],
        "stream": False
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error sending chat message: {e}")
        if 'response' in locals() and response is not None:
            print(f"Response: {response.text}")
        return None

def main():
    print("Starting chat agent...")
    
    # 1. Get Access Token
    token = get_access_token()
    if not token:
        print("Failed to authenticate. Exiting.")
        return

    # 2. Send Message (using the example from api_list.md)
    message = "機密と明示されたもののみ機密情報として扱うに変更してくれ"
    print(f"Sending message: {message}")
    
    response = send_chat_message(token, message)
    
    if response:
        print("\n--- Response from Watsonx Orchestrate ---")
        # Pretty print logic if it's a known format, otherwise just print
        if 'choices' in response and len(response['choices']) > 0:
             print(response['choices'][0]['message']['content'])
             print("\n--- Full JSON ---")
        
        import json
        print(json.dumps(response, indent=4, ensure_ascii=False))
    else:
        print("No response received.")

if __name__ == "__main__":
    main()
