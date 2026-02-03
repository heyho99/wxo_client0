"""
WXO Test Automation Script

このスクリプトは、CSVファイルから質問を読み込み、
Watsonx Orchestrate エージェントに送信し、
回答を含む新しいCSVファイルを出力します。

Usage:
    python3 wxo_test_automation.py input.csv output.csv

    または、デフォルトのファイル名を使用:
    python3 wxo_test_automation.py
    (入力: questions.csv, 出力: results.csv)
"""

import os
import sys
import csv
import requests
from dotenv import load_dotenv
from datetime import datetime

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
    
    if not api_key:
        print("Error: IBM_CLOUD_API_KEY is not set in .env file.")
        return None
    
    data = {
        "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
        "apikey": api_key
    }

    try:
        response = requests.post(url, headers=headers, data=data)
        response.raise_for_status()
        token_data = response.json()
        return token_data.get("access_token")
    except requests.exceptions.RequestException as e:
        print(f"Error retrieving access token: {e}")
        return None


def send_chat_message(token, message_content):
    """
    Sends a chat message to the Watsonx Orchestrate agent.
    """
    instance_id = os.getenv("WXO_INSTANCE_ID")
    agent_id = os.getenv("WXO_AGENT_ID")
    api_host = os.getenv("WXO_API_HOST", "api.us-south.watson-orchestrate.cloud.ibm.com")

    if not instance_id or not agent_id:
        return None, "Error: WXO_INSTANCE_ID or WXO_AGENT_ID is not set."

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
        result = response.json()
        
        # Extract answer from response
        if 'choices' in result and len(result['choices']) > 0:
            return result['choices'][0]['message']['content'], None
        else:
            return str(result), None
            
    except requests.exceptions.RequestException as e:
        return None, f"Error: {e}"


def process_csv(input_file, output_file):
    """
    Reads questions from input CSV and writes results to output CSV.
    """
    print(f"Input file: {input_file}")
    print(f"Output file: {output_file}")
    print("-" * 50)
    
    # 1. Get Access Token
    print("Retrieving access token...")
    token = get_access_token()
    if not token:
        print("Failed to authenticate. Exiting.")
        return False
    print("Access token retrieved successfully.")
    print("-" * 50)
    
    # 2. Read input CSV
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            questions = list(reader)
    except FileNotFoundError:
        print(f"Error: Input file '{input_file}' not found.")
        return False
    except Exception as e:
        print(f"Error reading input file: {e}")
        return False
    
    if not questions:
        print("No questions found in input file.")
        return False
    
    print(f"Found {len(questions)} questions.")
    print("-" * 50)
    
    # Determine the question column name
    # Try common column names
    question_column = None
    for col in ['Question', 'question', '質問', 'input', 'Input']:
        if col in questions[0]:
            question_column = col
            break
    
    if not question_column:
        # Use the first column
        question_column = list(questions[0].keys())[0]
        print(f"Using first column '{question_column}' as question column.")
    else:
        print(f"Using column '{question_column}' for questions.")
    
    # 3. Process each question
    results = []
    for idx, row in enumerate(questions, 1):
        question = row.get(question_column, "").strip()
        
        if not question:
            print(f"[{idx}/{len(questions)}] Skipping empty question.")
            results.append({
                "Question": "",
                "Answer": "",
                "Status": "Skipped"
            })
            continue
        
        print(f"[{idx}/{len(questions)}] Processing: {question[:50]}...")
        
        answer, error = send_chat_message(token, question)
        
        if error:
            print(f"  -> Error: {error}")
            results.append({
                "Question": question,
                "Answer": "",
                "Status": error
            })
        else:
            print(f"  -> OK")
            results.append({
                "Question": question,
                "Answer": answer,
                "Status": "Success"
            })
    
    # 4. Write output CSV
    print("-" * 50)
    print(f"Writing results to {output_file}...")
    
    try:
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["Question", "Answer", "Status"],
                quoting=csv.QUOTE_ALL,
                # doublequote=True,
                lineterminator='\r\n', # 行終端文字
                extrasaction='raise', # 余分なフィールドがあればエラー
                strict=True # 不正なcsvはエラー
            )
            writer.writeheader()
            writer.writerows(results)
        print(f"Done! Results saved to {output_file}")
        return True
    except Exception as e:
        print(f"Error writing output file: {e}")
        return False


def main():
    """
    Main entry point.
    """
    # Default file names
    default_input = "questions.csv"
    default_output = "results.csv"
    
    if len(sys.argv) >= 3:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
    elif len(sys.argv) == 2:
        input_file = sys.argv[1]
        # Generate output filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"results_{timestamp}.csv"
    else:
        input_file = default_input
        output_file = default_output
    
    print("=" * 50)
    print("WXO Test Automation")
    print("=" * 50)
    
    success = process_csv(input_file, output_file)
    
    if success:
        print("=" * 50)
        print("Completed successfully!")
    else:
        print("=" * 50)
        print("Completed with errors.")
        sys.exit(1)


if __name__ == "__main__":
    main()
