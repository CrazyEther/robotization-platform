import asyncio, os, re
from pathlib import Path
from mcp import ClientSession,StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT=Path(__file__).resolve().parents[1]
EXE=ROOT/'.tools'/'anylogic-mcp-venv'/'Scripts'/'anylogic-mcp.exe'
OUT=ROOT/'.tools'/'anylogic-ple-models'
OUT.mkdir(parents=True,exist_ok=True)
async def main():
    params=StdioServerParameters(command=str(EXE),args=[],env={**os.environ,'ALP_OUTPUT_DIR':str(OUT)})
    async with stdio_client(params) as (r,w):
        async with ClientSession(r,w) as session:
            init=await session.initialize()
            tools=await session.list_tools()
            names={tool.name for tool in tools.tools}
            assert {'anylogic_create_model_ple','anylogic_download_for_ple','anylogic_get_ple_limits'}.issubset(names),names
            print('MCP_HANDSHAKE_OK',init.serverInfo.name,len(names))
            response=await session.call_tool('anylogic_create_model_ple',{'name':'RIS_MCP_Smoke','description':'Synthetic queue test, NOT mobile robot simulation','model_type':'simple_queue'})
            value='\n'.join(item.text for item in response.content if hasattr(item,'text'))
            match=re.search(r'Model ID:\s*([a-f0-9-]+)',value)
            assert match and not response.isError,value[:1200]
            second=await session.call_tool('anylogic_download_for_ple',{'model_id':match.group(1)})
            assert not second.isError
            alp=OUT/'RIS_MCP_Smoke.alp'
            assert alp.is_file() and alp.stat().st_size>5000
            print('MCP_ALP_CREATED',alp,alp.stat().st_size)
asyncio.run(main())
