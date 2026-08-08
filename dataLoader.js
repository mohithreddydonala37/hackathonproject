const fs = require('fs');
const path = require('path');

let curriculumData = null;
let candidatesData = null;

function loadData() {
  if (!curriculumData) {
    const currPath = path.join(__dirname, 'data', 'curriculum.json');
    if (fs.existsSync(currPath)) {
      curriculumData = JSON.parse(fs.readFileSync(currPath, 'utf8'));
    }
  }

  if (!candidatesData) {
    const candPath = path.join(__dirname, 'data', 'candidates.json');
    if (fs.existsSync(candPath)) {
      candidatesData = JSON.parse(fs.readFileSync(candPath, 'utf8'));
    }
  }

  return { curriculumData, candidatesData };
}

function getCurriculumDay(dayNumber) {
  const { curriculumData } = loadData();
  if (!curriculumData || !curriculumData.days) return null;
  return curriculumData.days.find(d => d.day === dayNumber) || null;
}

function getCandidateById(candidateId) {
  const { candidatesData } = loadData();
  if (!candidatesData || !candidatesData.candidates) return null;
  return candidatesData.candidates.find(c => c.member && c.member.id === candidateId) || null;
}

function getAllCandidates() {
  const { candidatesData } = loadData();
  if (!candidatesData || !candidatesData.candidates) return [];
  return candidatesData.candidates;
}

module.exports = {
  loadData,
  getCurriculumDay,
  getCandidateById,
  getAllCandidates
};
