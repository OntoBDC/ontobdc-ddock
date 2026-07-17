import os
import logging
import traceback
import sys
import time
import glob
from datetime import datetime

def log_and_raise_error(e: Exception, context_name: str = "GatewayContainerLoader", log_prefix: str = "gateway.loader"):
    """
    Logs the full traceback of an exception to a daily rotated file and raises a new exception.
    """
    log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "log"))
    os.makedirs(log_dir, exist_ok=True)
    
    current_date = datetime.now().strftime("%Y%m%d")
    log_file = os.path.join(log_dir, f"{log_prefix}.{current_date}.log")

    logger = logging.getLogger(context_name)
    logger.propagate = False
    
    # Limpa handlers antigos para evitar duplicação ou handlers zumbis
    if logger.hasHandlers():
        logger.handlers.clear()
        
    logger.setLevel(logging.ERROR)
    handler = logging.FileHandler(log_file)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s\n%(exc_info)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Limpeza manual de logs mais antigos que 7 dias
    now = time.time()
    for f in glob.glob(os.path.join(log_dir, f"{log_prefix}.*.log")):
        if os.path.isfile(f) and os.stat(f).st_mtime < now - 7 * 86400:
            try:
                os.remove(f)
            except OSError:
                pass

    # Formata o traceback completo como string usando sys.exc_info() se disponível
    exc_type, exc_value, exc_traceback = sys.exc_info()
    if exc_type is None:
        # Fallback caso a função seja chamada fora de um bloco except ativo
        exc_type, exc_value, exc_traceback = type(e), e, e.__traceback__
        
    tb_string = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))

    # Grava no log
    logger.error(f"Error dispatching command:\n{tb_string}")
    
    # Força o flush imediato
    handler.flush()

    raise Exception(f"Error: {e}")
