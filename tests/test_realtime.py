import pytest
from data.realtime import RealTimeDataProvider


@pytest.mark.skip("stub: implement realtime stream mocks")
@pytest.mark.asyncio
async def test_realtime_stream_stub():
r = RealTimeDataProvider()
async for _ in r.stream("AAPL"):
break