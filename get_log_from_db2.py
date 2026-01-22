import urllib.request
import json
import csv
import io
import os
import time

def db2_request(url, method, headers, payload=None):
    data = json.dumps(payload).encode('utf-8') if payload else None
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def main(args):
    # 環境変数の取得
    hostname = os.getenv("DB2_HOSTNAME")
    userid = os.getenv("DB2_USERID")
    password = (os.getenv("DB2_PASSWORD") or os.getenv("PASSWORD"))
    deployment_id = os.getenv("DB2_DEPLOYMENT_ID")
    
    base_url = f"https://{hostname}/dbapi/v4"

    try:
        # 1. 認証トークンの取得
        auth_headers = {"Content-Type": "application/json", "x-deployment-id": deployment_id}
        auth_payload = {"userid": userid, "password": password}
        token_data = db2_request(f"{base_url}/auth/tokens", "POST", auth_headers, auth_payload)
        token = token_data.get("token")

        # 2. SQLジョブの投入
        common_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-deployment-id": deployment_id
        }
        sql_payload = {
            "commands": 'SELECT * FROM "CLD47628"."WXO_LOG" ORDER BY "timestamp" DESC',
            "limit": 5000,
            "separator": ";",
            "stop_on_error": "yes"
        }
        job_submit = db2_request(f"{base_url}/sql_jobs", "POST", common_headers, sql_payload)
        job_id = job_submit.get("id")

        # 3. ジョブ完了の待機 (ポーリング)
        rows = []
        column_names = []
        for _ in range(10): # 最大10秒待機
            time.sleep(1)
            job_status = db2_request(f"{base_url}/sql_jobs/{job_id}", "GET", common_headers)
            new_results = job_status.get("results", [])
            for res in new_results:
                if "rows" in res: rows.extend(res["rows"])
                if "columnNames" in res and not column_names: column_names = res["columnNames"]
            
            if job_status.get("status") == "completed": break

        # 4. CSV変換 (BOM付きUTF-8)
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        if column_names: writer.writerow(column_names)
        writer.writerows(rows)
        
        # Excelで開いた際の文字化けを防ぐため BOM (\ufeff) を付与
        csv_body = "\ufeff" + output.getvalue()

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "text/csv; charset=utf-8",
                "Access-Control-Allow-Origin": "*",  # ← すべてのドメインからのアクセスを許可
                "Content-Disposition": "attachment; filename=wxo_logs.csv"
            },
            "body": csv_body
        }

    except Exception as e:
        return {"statusCode": 500, "body": str(e)}



if __name__ == "__main__":
    print("17件のデータ取得を開始します...")
    # Code Engine 用の関数を空の引数 {} で実行
    result = main({})
    
    if result["statusCode"] == 200:
        # 取得した CSV 文字列 (result["body"]) をファイルに保存
        with open("log_output.csv", "w", encoding="utf-8-sig", newline="") as f:
            f.write(result["body"])
        print("--- 成功！ ---")
        print("ファイル 'log_output.csv' が作成されました。")
    else:
        print(f"--- 失敗 (Status: {result['statusCode']}) ---")
        print(f"エラー内容: {result['body']}")