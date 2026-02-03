### アクセストークン取得
```HTTP
POST /identity/token HTTP/1.1
Host: iam.cloud.ibm.com
Content-Type: application/x-www-form-urlencoded
grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=<api_key>
```

### wxOエージェントにリクエスト
tokenには取得したアクセストークンを入れる
```HTTP
POST /instances/<instance_id>/v1/orchestrate/<agent_id>/chat/completions HTTP/1.1
Host: api.us-south.watson-orchestrate.cloud.ibm.com
Authorization: Bearer <token>
accept: application/json
content-type: application/json
{
    "messages": [
        {
            "role": "user",
            "content": "仕入先がイグアス書式の契約書に合意してもらえない場合はどうすればいいでしょうか"
        }
    ],
    "stream": false
}
```

### CodeEngineテストcurl
```curl
curl -X POST "https://wxo-test-auto.25f0qwsr2onp.us-south.codeengine.appdomain.cloud/" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "27e6dff3-4f30-42d4-b49a-d5c697328009",
    "questions": ["機密と明示されたもののみ機密情報として扱うに変更してくれ"]
  }'
```