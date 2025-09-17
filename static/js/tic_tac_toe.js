<<<<<<< HEAD
document.addEventListener("DOMContentLoaded", function () {
  const cells = document.querySelectorAll("#tic-tac-toe-board td");
  const status = document.getElementById("tic-tac-toe-status");
  const resetBtn = document.getElementById("tic-tac-toe-reset");

  const playerXInput = document.getElementById("playerXName");
  const playerOInput = document.getElementById("playerOName");

  let board = Array(12).fill("");
  let currentPlayer = "X";
  let gameActive = true;

const winningCombos = [
  [0, 1, 2, 3],    // horizontal rows
  [4, 5, 6, 7],
  [8, 9, 10, 11]
  // no vertical or diagonal 4-cell wins on 3-row board
];

function getPlayerName(player) {
    if (player === "X") {
      return playerXInput.value.trim() || "Player X";
    } else {
      return playerOInput.value.trim() || "Player O";
    }
  }

cells.forEach((cell, idx) => {
  cell.addEventListener("click", () => {
    console.log(`Clicked cell ${idx}, current board:`, board);
    if (!gameActive || board[idx] !== "") return;
    board[idx] = currentPlayer;
    cell.textContent = currentPlayer;
    currentPlayer = currentPlayer === "X" ? "O" : "X";
    updateStatus();
  });
});

function checkWinner() {
  for (const combo of winningCombos) {
    const marks = combo.map(idx => board[idx]);
    if (
      marks.length === 4 && // ensure combo is 4 cells long
      marks[0] !== "" &&
      marks.every(val => val === marks[0])
    ) {
      return marks[0];
    }
  }
  return board.includes("") ? null : "draw";
}

function updateStatus() {
    const winner = checkWinner();
    if (winner === "draw") {
      status.textContent = "It's a draw!";
      gameActive = false;
    } else if (winner) {
      status.textContent = `${getPlayerName(winner)} wins! 🎉`;
      gameActive = false;
    } else {
      status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
    }
  }

  resetBtn.addEventListener("click", () => {
    board.fill("");
    cells.forEach(cell => cell.textContent = "");
    currentPlayer = "X";
    gameActive = true;
    updateStatus();
  });

  playerXInput.addEventListener("input", updateStatus);
  playerOInput.addEventListener("input", updateStatus);

  updateStatus();
});
=======
document.addEventListener("DOMContentLoaded", function () {
  const cells = document.querySelectorAll("#tic-tac-toe-board td");
  const status = document.getElementById("tic-tac-toe-status");
  const resetBtn = document.getElementById("tic-tac-toe-reset");

  const playerXInput = document.getElementById("playerXName");
  const playerOInput = document.getElementById("playerOName");

  let board = Array(12).fill("");
  let currentPlayer = "X";
  let gameActive = true;

const winningCombos = [
  [0, 1, 2, 3],    // horizontal rows
  [4, 5, 6, 7],
  [8, 9, 10, 11]
  // no vertical or diagonal 4-cell wins on 3-row board
];

function getPlayerName(player) {
    if (player === "X") {
      return playerXInput.value.trim() || "Player X";
    } else {
      return playerOInput.value.trim() || "Player O";
    }
  }

cells.forEach((cell, idx) => {
  cell.addEventListener("click", () => {
    console.log(`Clicked cell ${idx}, current board:`, board);
    if (!gameActive || board[idx] !== "") return;
    board[idx] = currentPlayer;
    cell.textContent = currentPlayer;
    currentPlayer = currentPlayer === "X" ? "O" : "X";
    updateStatus();
  });
});

function checkWinner() {
  for (const combo of winningCombos) {
    const marks = combo.map(idx => board[idx]);
    if (
      marks.length === 4 && // ensure combo is 4 cells long
      marks[0] !== "" &&
      marks.every(val => val === marks[0])
    ) {
      return marks[0];
    }
  }
  return board.includes("") ? null : "draw";
}

function updateStatus() {
    const winner = checkWinner();
    if (winner === "draw") {
      status.textContent = "It's a draw!";
      gameActive = false;
    } else if (winner) {
      status.textContent = `${getPlayerName(winner)} wins! 🎉`;
      gameActive = false;
    } else {
      status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
    }
  }

  resetBtn.addEventListener("click", () => {
    board.fill("");
    cells.forEach(cell => cell.textContent = "");
    currentPlayer = "X";
    gameActive = true;
    updateStatus();
  });

  playerXInput.addEventListener("input", updateStatus);
  playerOInput.addEventListener("input", updateStatus);

  updateStatus();
});
>>>>>>> 1c86a86 (Initial commit)
