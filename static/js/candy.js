
(function(){
  // config
  const COLS = 8, ROWS = 8;
  const CANDY_TYPES = ['c-red','c-blue','c-green','c-yellow','c-purple','c-orange'];
  const START_MOVES = 30;
  const TARGET_SCORE = 2000;
  const SCORE_BASE = 60; // base per candy in a match

  // DOM
  const gridEl = document.getElementById('grid');
  const scoreEl = document.getElementById('score');
  const movesEl = document.getElementById('moves');
  const statusLabel = document.getElementById('statusLabel');
  const hintText = document.getElementById('hintText');
  const targetEl = document.getElementById('target');

  targetEl.textContent = TARGET_SCORE;

  // state
  let board = []; // 2D array [r][c] of candy objects {type, el}
  let selected = null;
  let score = 0;
  let moves = START_MOVES;
  let animating = false;
  let idleTimer = null;

  // helper: create DOM cell & candy
  function makeCell(r,c){
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.r = r;
    cell.dataset.c = c;
    cell.addEventListener('click', onCellClick);
    // candy placeholder
    const candy = document.createElement('div');
    candy.className = 'candy';
    cell.appendChild(candy);
    return { cell, candy };
  }

  function randCandyType(){
    return CANDY_TYPES[Math.floor(Math.random()*CANDY_TYPES.length)];
  }

  function initBoard(){
    gridEl.innerHTML = '';
    board = [];
    for(let r=0;r<ROWS;r++){
      const row=[];
      for(let c=0;c<COLS;c++){
        const {cell, candy} = makeCell(r,c);
        gridEl.appendChild(cell);
        row.push({ type: null, el: candy, cellEl:cell });
      }
      board.push(row);
    }
    // fill ensuring no starting matches
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        let t;
        do {
          t = randCandyType();
        } while (
          (c>=2 && board[r][c-1].type===t && board[r][c-2].type===t) ||
          (r>=2 && board[r-1][c].type===t && board[r-2][c].type===t)
        );
        board[r][c].type = t;
        updateCandyEl(board[r][c]);
      }
    }

    score = 0; moves = START_MOVES;
    updateHUD();
    status('Match 3 or more to score!');
    scheduleHint();
  }

  function updateCandyEl(cellObj){
    const el = cellObj.el;
    el.className = 'candy ' + cellObj.type;
    // reset removed class if any
    el.classList.remove('removed');
  }

  function onCellClick(e){
    if(animating) return;
    const cell = e.currentTarget;
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const clicked = board[r][c];
    // selection
    if(!selected){
      selected = { r,c };
      cell.classList.add('selected');
    } else {
      // if clicked same, deselect
      if(selected.r===r && selected.c===c){
        cell.classList.remove('selected'); selected=null;
        return;
      }
      // check adjacency
      const dr = Math.abs(selected.r - r), dc = Math.abs(selected.c - c);
      if((dr===1 && dc===0) || (dr===0 && dc===1)){
        // attempt swap
        performSwap(selected, {r,c});
      } else {
        // change selection
        const prevCell = document.querySelector('.cell.selected');
        if(prevCell) prevCell.classList.remove('selected');
        selected = { r,c };
        cell.classList.add('selected');
      }
    }
    scheduleHint();
  }

  function performSwap(a, b){
    animating = true;
    clearSelection();
    const aObj = board[a.r][a.c], bObj = board[b.r][b.c];

    // animate small swap effect
    aObj.cellEl.classList.add('swap-anim');
    bObj.cellEl.classList.add('swap-anim');

    // swap types in board
    [aObj.type, bObj.type] = [bObj.type, aObj.type];
    updateCandyEl(aObj); updateCandyEl(bObj);

    // after tiny delay, check matches
    setTimeout(()=>{
      const matches = findAllMatches();
      if(matches.length>0){
        moves = Math.max(0, moves-1);
        updateHUD();
        cascadeMatches(matches);
      } else {
        // revert swap (invalid)
        [aObj.type, bObj.type] = [bObj.type, aObj.type];
        updateCandyEl(aObj); updateCandyEl(bObj);
        // visual feedback
        aObj.cellEl.classList.add('shake');
        bObj.cellEl.classList.add('shake');
        setTimeout(()=>{ aObj.cellEl.classList.remove('shake'); bObj.cellEl.classList.remove('shake'); animating=false; }, 240);
      }
      aObj.cellEl.classList.remove('swap-anim');
      bObj.cellEl.classList.remove('swap-anim');
    }, 180);
  }

  function clearSelection(){
    const sel = document.querySelector('.cell.selected');
    if(sel) sel.classList.remove('selected');
    selected = null;
  }

  // detect matches: returns array of arrays of {r,c}
  function findAllMatches(){
    const matches = [];
    const seen = Array.from({length:ROWS},()=>Array(COLS).fill(false));

    // horizontal
    for(let r=0;r<ROWS;r++){
      let run = [{r, c:0}];
      for(let c=1;c<COLS;c++){
        if(board[r][c].type && board[r][c].type===board[r][c-1].type){
          run.push({r,c});
        } else {
          if(run.length>=3){
            matches.push([...run]);
          }
          run = [{r,c}];
        }
      }
      if(run.length>=3) matches.push([...run]);
    }

    // vertical
    for(let c=0;c<COLS;c++){
      let run = [{r:0, c}];
      for(let r=1;r<ROWS;r++){
        if(board[r][c].type && board[r][c].type===board[r-1][c].type){
          run.push({r,c});
        } else {
          if(run.length>=3){
            matches.push([...run]);
          }
          run = [{r,c}];
        }
      }
      if(run.length>=3) matches.push([...run]);
    }

    // merge overlapping matches (optional) — leave as is; duplicates across axes okay
    // but convert each match into unique set
    const uniqueSets = [];
    for(const m of matches){
      const key = m.map(p=>p.r+','+p.c).sort().join('|');
      if(!uniqueSets.some(u=>u.key===key)) uniqueSets.push({key, coords:m});
    }
    return uniqueSets.map(u=>u.coords);
  }

  // remove matches (with animation), then apply gravity and refill
  function cascadeMatches(matches){
    if(!matches || matches.length===0){ animating=false; checkEndState(); return; }

    // mark removed candies
    const toRemove = new Set();
    for(const m of matches){
      for(const p of m) toRemove.add(p.r+','+p.c);
    }

    // scoring: base * number * combo multiplier
    const removedCount = toRemove.size;
    const comboMultiplier = 1 + (matches.length - 1) * 0.25;
    const gained = Math.floor(SCORE_BASE * removedCount * comboMultiplier);
    score += gained;
    updateHUD();

    // animate removals
    for(const key of toRemove){
      const [r,c] = key.split(',').map(Number);
      const obj = board[r][c];
      obj.el.classList.add('removed');
      // clear type after a bit so gravity uses inPocket-like state
    }

    // after animation, set types to null and drop
    setTimeout(()=>{
      for(const key of toRemove){
        const [r,c] = key.split(',').map(Number);
        board[r][c].type = null;
        board[r][c].el.className = 'candy'; // reset classes
      }
      // gravity: for each column, move candies down
      dropCandies();
      // after drop, find new matches (cascade)
      setTimeout(()=>{
        const newMatches = findAllMatches();
        if(newMatches.length>0){
          // small delay before next cascade
          setTimeout(()=> cascadeMatches(newMatches), 180);
        } else {
          animating=false;
          checkEndState();
        }
      }, 160);
    }, 340);
  }

  function dropCandies(){
    for(let c=0;c<COLS;c++){
      let writeRow = ROWS-1;
      for(let r=ROWS-1;r>=0;r--){
        if(board[r][c].type){
          if(writeRow !== r){
            board[writeRow][c].type = board[r][c].type;
            board[writeRow][c].el.className = 'candy '+ board[writeRow][c].type;
            board[r][c].type = null;
            board[r][c].el.className = 'candy';
          }
          writeRow--;
        }
      }
      // fill remaining top slots with new random candies
      for(let r=writeRow; r>=0; r--){
        const t = randCandyType();
        board[r][c].type = t;
        board[r][c].el.className = 'candy '+t;
      }
    }
  }

  function updateHUD(){
    scoreEl.textContent = score;
    movesEl.textContent = moves;
  }

  function status(txt){
    statusLabel.textContent = txt;
  }

  function checkEndState(){
    // win
    if(score >= TARGET_SCORE){
      status('You Win! 🎉');
      animating = true;
      return;
    }
    // lose
    if(moves <= 0){
      status('No moves left — Game Over');
      animating = true;
      return;
    }
    status('Ready');
    scheduleHint();
  }

  // hint scheduler
  function findAnyBestSwap(){
    // brute force: try swapping every adjacent pair and see if it creates a match
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const dirs = [[0,1],[1,0]];
        for(const [dr,dc] of dirs){
          const nr=r+dr, nc=c+dc;
          if(nr<ROWS && nc<COLS){
            // swap types
            [board[r][c].type, board[nr][nc].type] = [board[nr][nc].type, board[r][c].type];
            const matches = findAllMatches();
            // revert
            [board[r][c].type, board[nr][nc].type] = [board[nr][nc].type, board[r][c].type];
            if(matches.length>0) return [{r,c},{r:nr,c:nc}];
          }
        }
      }
    }
    return null;
  }

  function scheduleHint(){
    clearTimeout(idleTimer);
    hintText.textContent = 'Tip: swap adjacent candies';
    idleTimer = setTimeout(()=>{
      const s = findAnyBestSwap();
      if(s){
        hintText.textContent = `Hint: swap (${s[0].r+1},${s[0].c+1}) ↔ (${s[1].r+1},${s[1].c+1})`;
      } else {
        hintText.textContent = 'No obvious matches — try Shuffle';
      }
    }, 2000);
  }

  // shuffle board randomly (ensuring solvable not guaranteed)
  function shuffleBoard(){
    if(animating) return;
    // flatten types
    const types = [];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) types.push(board[r][c].type);
    // shuffle
    for(let i=types.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    // assign and ensure no immediate matches (try few times)
    let tries = 0;
    do {
      let idx=0;
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) board[r][c].type = types[idx++];
      tries++;
      if(findAllMatches().length===0) break;
      // else reshuffle
      for(let i=types.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [types[i], types[j]] = [types[j], types[i]];
      }
    } while(tries<8);
    // update DOM
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) updateCandyEl(board[r][c]);
    status('Board shuffled');
    scheduleHint();
  }

  // UI actions
  document.getElementById('btnRestart').addEventListener('click', ()=> {
    initBoard();
  });
  document.getElementById('btnShuffle').addEventListener('click', ()=> {
    shuffleBoard();
  });
  document.getElementById('btnHint').addEventListener('click', ()=> {
    const s = findAnyBestSwap();
    if(s){
      hintText.textContent = `Hint: swap (${s[0].r+1},${s[0].c+1}) ↔ (${s[1].r+1},${s[1].c+1})`;
    } else {
      hintText.textContent = 'No obvious matches — try Shuffle';
    }
  });

  // initialize
  initBoard();

})();