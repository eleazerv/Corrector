"""Checkpointer LangGraph.

LANGGRAPH_CHECKPOINT=postgres  -> AsyncPostgresSaver (resume setelah crash / retry)  [default]
LANGGRAPH_CHECKPOINT=memory    -> InMemorySaver (hilang saat worker restart; untuk dev)
LANGGRAPH_CHECKPOINT=none      -> tanpa checkpoint (retry = mulai dari awal)

Postgres saver butuh psycopg (bukan asyncpg) -> pool terpisah, kecil.
Tabel yang dibuat saver.setup(): checkpoints, checkpoint_blobs, checkpoint_writes,

"""

from urllib.parse import urlparse 

from core.logging import log 

async def create_checkpointer(mode: str , dsn: str): 
    """Return (checkpointer, closer). closer() dipanggil saat shutdown."""
    mode = (mode or "postgres").lower()
    
    if mode == "none" : 
        return None , None 
    
    if mode == "memory": 
        from langgraph.checkpoint.memory import InMemorySaver 
        return InMemorySaver() , None
    
    if mode == "postgres":
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg.rows import dict_row
        from psycopg_pool import AsyncConnectionPool
        
        prepare = None if urlparse(dsn).port == 6543 else 0 
        pool = AsyncConnectionPool(
            conninfo=dsn, min_size=1, max_size=5, open=False,
            check=AsyncConnectionPool.check_connection,
            max_idle=120,
            kwargs={"autocommit": True, "prepare_threshold": prepare, "row_factory": dict_row},
        )
        await pool.open()
        saver = AsyncPostgresSaver(pool)
        await saver.setup()                      # idempoten: bikin/migrasi tabel checkpoint
        log.info("checkpointer postgres siap")
        return saver, pool.close
    raise RuntimeError(f"LANGGRAPH_CHECKPOINT tidak dikenal: {mode!r} (postgres | memory | none)")
